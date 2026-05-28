import { randomBytes } from 'node:crypto'

import { type Prisma } from '@prisma/client'
import { z } from 'zod'

import { classifyCartFulfillment, normalizeCartFulfillmentType } from '@/lib/checkout/cart-fulfillment'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { buildCheckoutPricingWithDecisionsCents } from '@/server/checkout/pricing'
import { emitInternalEvent } from '@/server/events/dispatcher'
import { sendTrackedEmail } from '@/server/services/email-delivery.service'
import { buildAbandonedCheckoutRecoveryEmailMessage } from '@/server/services/email-template.service'
import { getStoreSettings } from '@/server/services/settings.service'

export const ABANDONED_CHECKOUT_DELAY_MS = 60 * 60 * 1000
export const RECOVERY_SEND_DELAYS_MS = [
  60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
] as const
export const MAX_RECOVERY_EMAIL_SENDS = 3
const DEFAULT_LIST_PAGE_SIZE = 20
const MAX_LIST_PAGE_SIZE = 100
const DEFAULT_DUE_LIMIT = 50
const MAX_DUE_LIMIT = 200

const RECOVERABLE_STATUSES = ['PENDING', 'FAILED'] as const

const checkoutAddressSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  province: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  phone: z.string().optional(),
})

const checkoutPayloadSchema = z.object({
  email: z.string().email().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string(),
      title: z.string(),
      variantTitle: z.string().optional(),
      sku: z.string().optional(),
      quantity: z.number().int().min(1),
      priceCents: z.number().int().nonnegative().optional(),
      price: z.number().nonnegative().optional(),
      fulfillmentType: z.enum(['PHYSICAL', 'DIGITAL']).optional(),
    })
  ),
  shippingAddress: checkoutAddressSchema.optional(),
  billingAddress: checkoutAddressSchema.optional(),
})

const recoveryTokenSchema = z.string().trim().min(16).max(256)

type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>
type CheckoutAddress = z.infer<typeof checkoutAddressSchema>
type CheckoutItem = CheckoutPayload['items'][number]

type CheckoutRecord = {
  id: string
  paymentIntentId: string
  email: string | null
  status: 'PENDING' | 'FAILED' | 'COMPLETED' | 'EXPIRED'
  currency: string
  subtotalCents: number
  shippingAmountCents: number
  taxAmountCents: number
  discountAmountCents: number
  totalCents: number
  payload: Prisma.JsonValue
  abandonedAt: Date | null
  recoveryToken: string | null
  recoveryEmailSentAt: Date | null
  recoveryEmailCount: number
  recoveredAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type AbandonedCheckoutListParams = {
  page?: number
  pageSize?: number
  search?: string
}

export type SendRecoveryEmailOptions = {
  now?: Date
  respectCadence?: boolean
}

export type SendDueRecoveryEmailOptions = {
  now?: Date
  limit?: number
}

export type AbandonedCheckoutSummary = {
  id: string
  email: string | null
  status: CheckoutRecord['status']
  currency: string
  subtotalCents: number
  shippingAmountCents: number
  taxAmountCents: number
  discountAmountCents: number
  totalCents: number
  createdAt: Date
  updatedAt: Date
  abandonedAt: Date | null
  recoveryEmailSentAt: Date | null
  recoveryEmailCount: number
  recoveredAt: Date | null
  itemCount: number
  items: Array<{
    title: string
    variantTitle?: string
    quantity: number
    priceCents?: number
  }>
}

export type RecoveryPayloadResult =
  | {
      ok: true
      checkout: {
        id: string
        email: string
        currency: string
        status: CheckoutRecord['status']
        items: Array<{
          productId: string
          variantId: string
          title: string
          variantTitle?: string
          quantity: number
          price: number
          priceCents: number
          fulfillmentType: 'PHYSICAL' | 'DIGITAL'
        }>
        shippingAddress?: CheckoutAddress
        billingAddress?: CheckoutAddress
        pricing: {
          subtotal: number
          shippingAmount: number
          taxAmount: number
          discountAmount: number
          total: number
          subtotalCents: number
          shippingAmountCents: number
          taxAmountCents: number
          discountAmountCents: number
          totalCents: number
        }
      }
    }
  | { ok: false; reason: 'INVALID_TOKEN' | 'COMPLETED' | 'NOT_RECOVERABLE' | 'UNAVAILABLE' }

export type SendRecoveryEmailResult = {
  sent: boolean
  skippedReason?:
    | 'NOT_FOUND'
    | 'NOT_RECOVERABLE'
    | 'MISSING_EMAIL'
    | 'ALREADY_RECOVERED'
    | 'MAX_SENDS_REACHED'
    | 'NOT_DUE'
    | 'ALREADY_CLAIMED'
}

const checkoutSelect = {
  id: true,
  paymentIntentId: true,
  email: true,
  status: true,
  currency: true,
  subtotalCents: true,
  shippingAmountCents: true,
  taxAmountCents: true,
  discountAmountCents: true,
  totalCents: true,
  payload: true,
  abandonedAt: true,
  recoveryToken: true,
  recoveryEmailSentAt: true,
  recoveryEmailCount: true,
  recoveredAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CheckoutSessionSelect

function clampPageSize(pageSize: number | undefined) {
  return Math.max(1, Math.min(MAX_LIST_PAGE_SIZE, Math.floor(pageSize ?? DEFAULT_LIST_PAGE_SIZE)))
}

function clampPage(page: number | undefined) {
  return Math.max(1, Math.floor(page ?? 1))
}

function clampDueLimit(limit: number | undefined) {
  return Math.max(1, Math.min(MAX_DUE_LIMIT, Math.floor(limit ?? DEFAULT_DUE_LIMIT)))
}

function isRecoverableStatus(status: string): status is (typeof RECOVERABLE_STATUSES)[number] {
  return RECOVERABLE_STATUSES.includes(status as (typeof RECOVERABLE_STATUSES)[number])
}

function parseCheckoutPayload(payload: Prisma.JsonValue): CheckoutPayload | null {
  const parsed = checkoutPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

function extractSafeItems(payload: Prisma.JsonValue) {
  const parsed = parseCheckoutPayload(payload)
  if (!parsed) {
    return { itemCount: 0, items: [] as AbandonedCheckoutSummary['items'] }
  }

  return {
    itemCount: parsed.items.reduce((sum, item) => sum + item.quantity, 0),
    items: parsed.items.slice(0, 5).map((item) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      priceCents: item.priceCents ?? dollarsToCents(item.price ?? 0),
    })),
  }
}

function toSummary(record: CheckoutRecord): AbandonedCheckoutSummary {
  const itemSummary = extractSafeItems(record.payload)

  return {
    id: record.id,
    email: record.email,
    status: record.status,
    currency: record.currency,
    subtotalCents: record.subtotalCents,
    shippingAmountCents: record.shippingAmountCents,
    taxAmountCents: record.taxAmountCents,
    discountAmountCents: record.discountAmountCents,
    totalCents: record.totalCents,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    abandonedAt: record.abandonedAt,
    recoveryEmailSentAt: record.recoveryEmailSentAt,
    recoveryEmailCount: record.recoveryEmailCount,
    recoveredAt: record.recoveredAt,
    itemCount: itemSummary.itemCount,
    items: itemSummary.items,
  }
}

function shouldSendByCadence(checkout: CheckoutRecord, now: Date) {
  if (checkout.recoveryEmailCount >= MAX_RECOVERY_EMAIL_SENDS) {
    return false
  }

  const delayMs =
    RECOVERY_SEND_DELAYS_MS[
      Math.min(checkout.recoveryEmailCount, RECOVERY_SEND_DELAYS_MS.length - 1)
    ]

  const baseTime = checkout.recoveryEmailSentAt ?? checkout.createdAt
  return now.getTime() - baseTime.getTime() >= delayMs
}

function canSendRecoveryEmail(checkout: CheckoutRecord) {
  if (!isRecoverableStatus(checkout.status)) {
    return { ok: false, reason: 'NOT_RECOVERABLE' as const }
  }

  if (checkout.completedAt) {
    return { ok: false, reason: 'NOT_RECOVERABLE' as const }
  }

  if (!checkout.email) {
    return { ok: false, reason: 'MISSING_EMAIL' as const }
  }

  if (checkout.recoveredAt) {
    return { ok: false, reason: 'ALREADY_RECOVERED' as const }
  }

  if (checkout.recoveryEmailCount >= MAX_RECOVERY_EMAIL_SENDS) {
    return { ok: false, reason: 'MAX_SENDS_REACHED' as const }
  }

  return { ok: true as const }
}

function randomRecoveryToken() {
  return randomBytes(32).toString('hex')
}

async function getCheckoutById(id: string) {
  return (await prisma.checkoutSession.findUnique({
    where: { id },
    select: checkoutSelect,
  })) as CheckoutRecord | null
}

async function resolveRecoveryItems(items: CheckoutItem[]) {
  const uniqueVariantIds = Array.from(new Set(items.map((item) => item.variantId)))

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: uniqueVariantIds },
      product: { status: 'ACTIVE' },
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          fulfillmentType: true,
        },
      },
    },
  })

  const variantMap = new Map(variants.map((variant) => [variant.id, variant]))

  return items.map((item) => {
    const variant = variantMap.get(item.variantId)
    if (!variant) {
      throw new Error(`Variant ${item.variantId} could not be found`)
    }

    if (variant.inventory < item.quantity) {
      throw new Error(`Only ${variant.inventory} units left for ${variant.product.title}`)
    }

    return {
      productId: variant.productId,
      variantId: variant.id,
      title: variant.product.title,
      variantTitle: variant.title ?? undefined,
      quantity: item.quantity,
      priceCents: variant.priceCents ?? dollarsToCents((variant as { price?: number }).price ?? 0),
      fulfillmentType: normalizeCartFulfillmentType(variant.product.fulfillmentType),
    }
  })
}

export function buildRecoveryUrl(checkoutSession: { recoveryToken: string | null }) {
  if (!checkoutSession.recoveryToken) {
    throw new Error('Recovery token is missing for checkout session')
  }

  const path = `/checkout?recovery_token=${encodeURIComponent(checkoutSession.recoveryToken)}`
  const baseUrl = env.NEXT_PUBLIC_STORE_URL?.replace(/\/$/, '')
  return baseUrl ? `${baseUrl}${path}` : path
}

export async function listAbandonedCheckouts(params: AbandonedCheckoutListParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const search = params.search?.trim()

  const where: Prisma.CheckoutSessionWhereInput = {
    status: { in: [...RECOVERABLE_STATUSES] },
    completedAt: null,
    abandonedAt: { not: null },
    ...(search
      ? {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.checkoutSession.count({ where }),
    prisma.checkoutSession.findMany({
      where,
      select: checkoutSelect,
      orderBy: [{ abandonedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    checkouts: rows.map((row) => toSummary(row as CheckoutRecord)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getAbandonedCheckout(id: string) {
  const record = await getCheckoutById(id)
  if (!record) return null

  if (!isRecoverableStatus(record.status) || record.completedAt) {
    return null
  }

  return toSummary(record)
}

export async function markDueCheckoutsAbandoned(now = new Date()) {
  const cutoff = new Date(now.getTime() - ABANDONED_CHECKOUT_DELAY_MS)
  const marked = await prisma.checkoutSession.updateMany({
    where: {
      status: { in: [...RECOVERABLE_STATUSES] },
      completedAt: null,
      abandonedAt: null,
      createdAt: { lte: cutoff },
    },
    data: {
      abandonedAt: now,
    },
  })

  if (marked.count > 0) {
    const markedRows = await prisma.checkoutSession.findMany({
      where: {
        status: { in: [...RECOVERABLE_STATUSES] },
        completedAt: null,
        abandonedAt: now,
      },
      select: {
        id: true,
        email: true,
        currency: true,
        totalCents: true,
      },
    })

    await Promise.allSettled(
      markedRows.map((row) =>
        emitInternalEvent('checkout.abandoned', {
          checkoutSessionId: row.id,
          email: row.email ?? undefined,
          total: centsToDollars(row.totalCents),
          currency: row.currency,
        })
      )
    )
  }

  return { markedAbandoned: marked.count }
}

export async function getDueRecoveryCandidates(now = new Date(), limit = DEFAULT_DUE_LIMIT) {
  const clampedLimit = clampDueLimit(limit)
  const cutoff = new Date(now.getTime() - ABANDONED_CHECKOUT_DELAY_MS)

  const rows = (await prisma.checkoutSession.findMany({
    where: {
      status: { in: [...RECOVERABLE_STATUSES] },
      completedAt: null,
      recoveredAt: null,
      email: { not: null },
      createdAt: { lte: cutoff },
      recoveryEmailCount: { lt: MAX_RECOVERY_EMAIL_SENDS },
    },
    select: checkoutSelect,
    orderBy: [{ createdAt: 'asc' }],
    take: clampedLimit,
  })) as CheckoutRecord[]

  return rows.filter((row) => shouldSendByCadence(row, now))
}

export async function sendRecoveryEmailForCheckout(
  id: string,
  options: SendRecoveryEmailOptions = {}
): Promise<SendRecoveryEmailResult> {
  const now = options.now ?? new Date()
  const checkout = await getCheckoutById(id)
  if (!checkout) {
    return { sent: false, skippedReason: 'NOT_FOUND' }
  }

  const eligibility = canSendRecoveryEmail(checkout)
  if (!eligibility.ok) {
    return { sent: false, skippedReason: eligibility.reason }
  }

  if (options.respectCadence && !shouldSendByCadence(checkout, now)) {
    return { sent: false, skippedReason: 'NOT_DUE' }
  }

  const token = checkout.recoveryToken ?? randomRecoveryToken()
  const claimed = await prisma.checkoutSession.updateMany({
    where: {
      id: checkout.id,
      updatedAt: checkout.updatedAt,
      status: { in: [...RECOVERABLE_STATUSES] },
      completedAt: null,
      recoveredAt: null,
      AND: [
        { recoveryEmailCount: checkout.recoveryEmailCount },
        { recoveryEmailCount: { lt: MAX_RECOVERY_EMAIL_SENDS } },
      ],
    },
    data: {
      recoveryToken: token,
      recoveryEmailSentAt: now,
      recoveryEmailCount: { increment: 1 },
      abandonedAt: checkout.abandonedAt ?? now,
    },
  })

  if (claimed.count === 0) {
    return { sent: false, skippedReason: 'ALREADY_CLAIMED' }
  }

  const claimedCheckout = await getCheckoutById(id)
  if (!claimedCheckout?.email) {
    return { sent: false, skippedReason: 'MISSING_EMAIL' }
  }

  const payload = parseCheckoutPayload(claimedCheckout.payload)
  const itemSummary = payload?.items
    ?.slice(0, 5)
    .map((item) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
    })) ?? []

  const message = await buildAbandonedCheckoutRecoveryEmailMessage({
    email: claimedCheckout.email,
    currency: claimedCheckout.currency,
    totalCents: claimedCheckout.totalCents,
    checkoutSessionId: claimedCheckout.id,
    recoveryUrl: buildRecoveryUrl(claimedCheckout),
    items: itemSummary,
  })

  await sendTrackedEmail({
    event: 'checkout.recovery',
    template: 'abandoned_checkout_recovery',
    recipientEmail: claimedCheckout.email,
    subject: message.subject,
    from: message.from,
    html: message.html,
  })

  await emitInternalEvent('checkout.recovery_email_sent', {
    checkoutSessionId: claimedCheckout.id,
    email: claimedCheckout.email,
    total: centsToDollars(claimedCheckout.totalCents),
    currency: claimedCheckout.currency,
    recoveryEmailCount: claimedCheckout.recoveryEmailCount,
  })

  return { sent: true }
}

export async function sendDueRecoveryEmails(options: SendDueRecoveryEmailOptions = {}) {
  const now = options.now ?? new Date()
  const { markedAbandoned } = await markDueCheckoutsAbandoned(now)
  const candidates = await getDueRecoveryCandidates(now, options.limit)

  let emailsAttempted = 0
  let emailsSent = 0
  let emailsFailed = 0
  let skipped = 0

  for (const candidate of candidates) {
    emailsAttempted += 1
    try {
      const result = await sendRecoveryEmailForCheckout(candidate.id, {
        now,
        respectCadence: true,
      })
      if (result.sent) {
        emailsSent += 1
      } else {
        skipped += 1
      }
    } catch {
      emailsFailed += 1
    }
  }

  return {
    markedAbandoned,
    emailsAttempted,
    emailsSent,
    emailsFailed,
    skipped,
  }
}

export async function recoverCheckoutByToken(token: string): Promise<RecoveryPayloadResult> {
  const parsedToken = recoveryTokenSchema.safeParse(token)
  if (!parsedToken.success) {
    return { ok: false, reason: 'INVALID_TOKEN' }
  }

  const checkout = (await prisma.checkoutSession.findUnique({
    where: { recoveryToken: parsedToken.data },
    select: checkoutSelect,
  })) as CheckoutRecord | null

  if (!checkout) {
    return { ok: false, reason: 'INVALID_TOKEN' }
  }

  if (checkout.status === 'COMPLETED' || checkout.completedAt) {
    return { ok: false, reason: 'COMPLETED' }
  }

  if (!isRecoverableStatus(checkout.status)) {
    return { ok: false, reason: 'NOT_RECOVERABLE' }
  }

  const payload = parseCheckoutPayload(checkout.payload)
  if (!payload || !payload.email || payload.items.length === 0) {
    return { ok: false, reason: 'UNAVAILABLE' }
  }

  let lineItems: Array<{
    productId: string
    variantId: string
    title: string
    variantTitle?: string
    quantity: number
    priceCents: number
    fulfillmentType: 'PHYSICAL' | 'DIGITAL'
  }>

  try {
    lineItems = await resolveRecoveryItems(payload.items)
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' }
  }

  const store = await getStoreSettings()
  const currency = (store?.currency || checkout.currency || 'USD').toUpperCase()
  const cartFulfillment = classifyCartFulfillment(lineItems)
  const requiresShipping = cartFulfillment === 'PHYSICAL_ONLY'
  const pricing = buildCheckoutPricingWithDecisionsCents(lineItems, store?.shippingThresholdCents, {
    shippingAddress: requiresShipping ? payload.shippingAddress : undefined,
    storeCountry: store?.country,
    currency,
    shippingRates: requiresShipping
      ? {
          domesticCents: Number(store?.shippingDomesticRateCents ?? 999),
          internationalCents: Number(store?.shippingInternationalRateCents ?? 1999),
        }
      : null,
    shippingZones: requiresShipping
      ? store?.shippingZones?.map((zone) => ({
          id: zone.id,
          name: zone.name,
          countryCode: zone.countryCode,
          provinceCode: zone.provinceCode,
          isActive: zone.isActive,
          priority: zone.priority,
          rates: zone.rates.map((rate) => ({
            id: rate.id,
            name: rate.name,
            method: rate.method,
            amountCents: rate.amountCents,
            minSubtotalCents: rate.minSubtotalCents,
            maxSubtotalCents: rate.maxSubtotalCents,
            isActive: rate.isActive,
            priority: rate.priority,
          })),
        }))
      : [],
    taxRules: store?.taxRules?.map((rule) => ({
      id: rule.id,
      name: rule.name,
      countryCode: rule.countryCode,
      provinceCode: rule.provinceCode,
      rate: rule.rate,
      isActive: rule.isActive,
      priority: rule.priority,
    })),
    ...(store?.country
      ? {
          taxRates: {
            domestic: Number(store?.domesticTaxRate ?? 0.07),
            international: Number(store?.internationalTaxRate ?? 0),
          },
        }
      : {}),
  })

  await emitInternalEvent('checkout.recovered', {
    checkoutSessionId: checkout.id,
    email: payload.email,
    total: centsToDollars(pricing.totalCents ?? 0),
    currency,
  })

  return {
    ok: true,
    checkout: {
      id: checkout.id,
      email: payload.email,
      currency,
      status: checkout.status,
      items: lineItems.map((item) => ({
        ...item,
        price: centsToDollars(item.priceCents),
      })),
      shippingAddress: payload.shippingAddress,
      billingAddress: payload.billingAddress ?? payload.shippingAddress,
      pricing: {
        subtotal: centsToDollars(pricing.subtotalCents ?? 0),
        shippingAmount: centsToDollars(pricing.shippingAmountCents ?? 0),
        taxAmount: centsToDollars(pricing.taxAmountCents ?? 0),
        discountAmount: centsToDollars(pricing.discountAmountCents ?? 0),
        total: centsToDollars(pricing.totalCents ?? 0),
        subtotalCents: pricing.subtotalCents ?? 0,
        shippingAmountCents: pricing.shippingAmountCents ?? 0,
        taxAmountCents: pricing.taxAmountCents ?? 0,
        discountAmountCents: pricing.discountAmountCents ?? 0,
        totalCents: pricing.totalCents ?? 0,
      },
    },
  }
}

export async function markCheckoutRecoveredByPaymentIntent(paymentIntentId: string) {
  if (!paymentIntentId) return { updated: 0 }

  const result = await prisma.checkoutSession.updateMany({
    where: {
      paymentIntentId,
      status: 'COMPLETED',
      completedAt: { not: null },
      recoveredAt: null,
      recoveryEmailCount: { gt: 0 },
    },
    data: {
      recoveredAt: new Date(),
    },
  })

  return { updated: result.count }
}

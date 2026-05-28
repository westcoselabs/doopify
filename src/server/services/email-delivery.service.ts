import type { EmailDeliveryStatus as PrismaEmailDeliveryStatus, Prisma } from '@prisma/client'

import { centsToDollars, dollarsToCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { emitInternalEvent } from '@/server/events/dispatcher'
import { sendTransactionalEmail } from '@/server/email/provider'
import { enqueueJob } from '@/server/jobs/job.service'
import { getBuyerDigitalDownloadAvailabilityForPaidOrder } from '@/server/services/digital-download-delivery.service'
import {
  buildFulfillmentTrackingEmailMessage,
  buildOrderConfirmationEmailMessage,
} from '@/server/services/email-template.service'
import { getOrderById } from '@/server/services/order.service'

export const EMAIL_DELIVERY_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'BOUNCED',
  'COMPLAINED',
  'RETRYING',
  'RESEND_REQUESTED',
] as const satisfies PrismaEmailDeliveryStatus[]

export type EmailDeliveryStatus = PrismaEmailDeliveryStatus

export const EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES = [
  'FAILED',
  'BOUNCED',
  'COMPLAINED',
] as const satisfies EmailDeliveryStatus[]

type EmailDeliveryResendEligibleStatus = typeof EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES[number]

const emailDeliveryListSelect = {
  id: true,
  event: true,
  template: true,
  recipientEmail: true,
  subject: true,
  status: true,
  provider: true,
  providerMessageId: true,
  attempts: true,
  lastError: true,
  nextRetryAt: true,
  sentAt: true,
  bouncedAt: true,
  complainedAt: true,
  orderId: true,
  customerId: true,
  refundId: true,
  returnId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmailDeliverySelect

type EmailDeliveryListRecord = Prisma.EmailDeliveryGetPayload<{
  select: typeof emailDeliveryListSelect
}>

export type CreateEmailDeliveryInput = {
  event: string
  template: string
  recipientEmail: string
  subject: string
  provider?: string
  orderId?: string
  customerId?: string
  refundId?: string
  returnId?: string
}

export type SendTrackedEmailInput = CreateEmailDeliveryInput & {
  from: string
  html: string
}

export type QueueOrderConfirmationEmailInput = {
  orderId: string
  orderNumber: number
  email: string
  provider?: string
}

export type QueueFulfillmentTrackingEmailInput = {
  orderId: string
  fulfillmentId: string
  provider?: string
}

export type EmailDeliveryDiagnostics = {
  delivery: EmailDeliveryListRecord
  resendPolicy: {
    canResend: boolean
    eligibleStatuses: EmailDeliveryResendEligibleStatus[]
    blockers: string[]
  }
  related: {
    order: {
      id: string
      orderNumber: number
      status: string
      paymentStatus: string
      fulfillmentStatus: string
      total: number
      totalCents: number
      currency: string
      createdAt: Date
    } | null
  }
}

export type ResendEmailDeliveryResult =
  | { success: true; delivery: EmailDeliveryListRecord }
  | {
      success: false
      reason: 'NOT_FOUND' | 'NOT_RESENDABLE' | 'UNSUPPORTED_TEMPLATE' | 'MISSING_CONTEXT'
      message: string
      blockers?: string[]
    }

export type EmailProviderWebhookEvent = {
  type: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string[]
    bounce?: {
      message?: string
      type?: string
      subType?: string
    }
  }
}

export type ApplyEmailProviderWebhookEventResult = {
  handled: boolean
  reason?: 'UNSUPPORTED_EVENT' | 'MISSING_EMAIL_ID' | 'DELIVERY_NOT_FOUND'
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : 'Email delivery failed'
}

function emailDeliveryClient() {
  return (prisma as any).emailDelivery
}

function parseTimestamp(value: string | undefined) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function hasResendEligibleStatus(status: EmailDeliveryStatus): status is EmailDeliveryResendEligibleStatus {
  return EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES.includes(status as EmailDeliveryResendEligibleStatus)
}

function resendPolicyBlockers(delivery: Pick<EmailDeliveryListRecord, 'status' | 'template' | 'orderId'>) {
  const blockers: string[] = []

  if (!hasResendEligibleStatus(delivery.status)) {
    blockers.push('Only failed, bounced, or complained deliveries can be resent')
  }

  if (delivery.template !== 'order_confirmation') {
    blockers.push(`Template "${delivery.template}" does not support safe resend yet`)
  }

  if (!delivery.orderId) {
    blockers.push('Safe resend requires a linked order')
  }

  return blockers
}

export async function createEmailDelivery(input: CreateEmailDeliveryInput) {
  return emailDeliveryClient().create({
    data: {
      event: input.event,
      template: input.template,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      provider: input.provider ?? 'resend',
      status: 'PENDING',
      orderId: input.orderId,
      customerId: input.customerId,
      refundId: input.refundId,
      returnId: input.returnId,
    },
  })
}

export async function markEmailDeliverySent(input: {
  deliveryId: string
  provider: string
  providerMessageId?: string
}) {
  const delivery = await emailDeliveryClient().update({
    where: { id: input.deliveryId },
    data: {
      status: 'SENT',
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      sentAt: new Date(),
      lastError: null,
      attempts: { increment: 1 },
    },
  })

  await emitInternalEvent('email.sent', {
    deliveryId: delivery.id,
    event: delivery.event,
    template: delivery.template,
    recipientEmail: delivery.recipientEmail,
    provider: delivery.provider,
    providerMessageId: delivery.providerMessageId,
    orderId: delivery.orderId,
    customerId: delivery.customerId,
    refundId: delivery.refundId,
    returnId: delivery.returnId,
  })

  return delivery
}

export async function markEmailDeliveryFailed(input: {
  deliveryId: string
  error: unknown
  retryable?: boolean
}) {
  const delivery = await emailDeliveryClient().update({
    where: { id: input.deliveryId },
    data: {
      status: input.retryable ? 'RETRYING' : 'FAILED',
      lastError: normalizeError(input.error),
      attempts: { increment: 1 },
      nextRetryAt: input.retryable ? new Date(Date.now() + 1000 * 60 * 5) : null,
    },
  })

  await emitInternalEvent('email.failed', {
    deliveryId: delivery.id,
    event: delivery.event,
    template: delivery.template,
    recipientEmail: delivery.recipientEmail,
    provider: delivery.provider,
    error: delivery.lastError ?? 'Email delivery failed',
    status: delivery.status === 'RETRYING' ? 'RETRYING' : 'FAILED',
    orderId: delivery.orderId,
    customerId: delivery.customerId,
    refundId: delivery.refundId,
    returnId: delivery.returnId,
  })

  return delivery
}

export function parseEmailProviderWebhookPayload(payload: string): EmailProviderWebhookEvent | null {
  try {
    const parsed = JSON.parse(payload)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof (parsed as { type?: unknown }).type !== 'string') return null
    return parsed as EmailProviderWebhookEvent
  } catch {
    return null
  }
}

export async function applyEmailProviderWebhookEvent(
  event: EmailProviderWebhookEvent
): Promise<ApplyEmailProviderWebhookEventResult> {
  const providerMessageId = String(event.data?.email_id || '').trim()
  if (!providerMessageId) {
    return { handled: false, reason: 'MISSING_EMAIL_ID' }
  }

  const toRecipient = Array.isArray(event.data?.to) ? event.data?.to[0] : undefined
  const baseWhere: Prisma.EmailDeliveryWhereInput = {
    provider: 'resend',
    providerMessageId,
  }
  const where: Prisma.EmailDeliveryWhereInput = toRecipient
    ? {
        ...baseWhere,
        recipientEmail: toRecipient,
      }
    : baseWhere

  if (event.type === 'email.bounced') {
    const updated = await emailDeliveryClient().updateMany({
      where,
      data: {
        status: 'BOUNCED',
        bouncedAt: parseTimestamp(event.created_at),
        lastError: event.data?.bounce?.message ?? 'Email bounced',
        nextRetryAt: null,
      },
    })

    return updated.count > 0
      ? { handled: true }
      : { handled: false, reason: 'DELIVERY_NOT_FOUND' }
  }

  if (event.type === 'email.complained') {
    const updated = await emailDeliveryClient().updateMany({
      where,
      data: {
        status: 'COMPLAINED',
        complainedAt: parseTimestamp(event.created_at),
        lastError: 'Recipient reported this email as spam',
        nextRetryAt: null,
      },
    })

    return updated.count > 0
      ? { handled: true }
      : { handled: false, reason: 'DELIVERY_NOT_FOUND' }
  }

  return { handled: false, reason: 'UNSUPPORTED_EVENT' }
}

export async function sendTrackedEmail(input: SendTrackedEmailInput) {
  const delivery = await createEmailDelivery({
    event: input.event,
    template: input.template,
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    provider: input.provider,
    orderId: input.orderId,
    customerId: input.customerId,
    refundId: input.refundId,
    returnId: input.returnId,
  })

  try {
    const result = await sendTransactionalEmail({
      from: input.from,
      to: [input.recipientEmail],
      subject: input.subject,
      html: input.html,
    })

    return markEmailDeliverySent({
      deliveryId: delivery.id,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    })
  } catch (error) {
    await markEmailDeliveryFailed({ deliveryId: delivery.id, error, retryable: false })
    throw error
  }
}

export async function getEmailDeliveries(input: {
  status?: EmailDeliveryStatus | 'ALL'
  template?: string | 'ALL'
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 20))
  const where = {
    ...(input.status && input.status !== 'ALL' ? { status: input.status } : {}),
    ...(input.template && input.template !== 'ALL' ? { template: input.template } : {}),
  }

  const [total, deliveries] = await Promise.all([
    emailDeliveryClient().count({ where }),
    emailDeliveryClient().findMany({
      where,
      select: emailDeliveryListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    deliveries,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function queueOrderConfirmationEmailDelivery(input: QueueOrderConfirmationEmailInput) {
  const delivery = await createEmailDelivery({
    event: 'order.paid',
    template: 'order_confirmation',
    recipientEmail: input.email,
    subject: `Order #${input.orderNumber} confirmation`,
    provider: input.provider,
    orderId: input.orderId,
  })

  const job = await enqueueJob(
    'SEND_ORDER_CONFIRMATION_EMAIL',
    {
      deliveryId: delivery.id,
      orderId: input.orderId,
    },
    {
      runAt: new Date(),
      maxAttempts: 5,
    }
  )

  return {
    delivery,
    job,
  }
}

export async function queueFulfillmentTrackingEmailDelivery(input: QueueFulfillmentTrackingEmailInput) {
  const order = await getOrderById(input.orderId)
  if (!order || !order.email) {
    return {
      delivery: null,
      job: null,
      skippedReason: 'MISSING_ORDER_EMAIL' as const,
    }
  }

  const delivery = await createEmailDelivery({
    event: 'fulfillment.created',
    template: 'fulfillment_tracking',
    recipientEmail: order.email,
    subject: `Order #${order.orderNumber} shipping update`,
    provider: input.provider,
    orderId: input.orderId,
  })

  const job = await enqueueJob(
    'SEND_FULFILLMENT_EMAIL',
    {
      deliveryId: delivery.id,
      orderId: input.orderId,
      fulfillmentId: input.fulfillmentId,
    },
    {
      runAt: new Date(),
      maxAttempts: 5,
    }
  )

  return {
    delivery,
    job,
    skippedReason: null,
  }
}

export async function processOrderConfirmationEmailDeliveryJob(input: { deliveryId: string; orderId?: string }) {
  const delivery = await emailDeliveryClient().findUnique({
    where: { id: input.deliveryId },
    select: {
      id: true,
      event: true,
      template: true,
      recipientEmail: true,
      subject: true,
      status: true,
      provider: true,
      orderId: true,
      customerId: true,
      refundId: true,
      returnId: true,
    },
  })

  if (!delivery || delivery.status === 'SENT') {
    return
  }

  const orderId = input.orderId ?? delivery.orderId
  if (!orderId) {
    throw new Error('Order confirmation delivery is missing linked order context')
  }

  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error(`Order ${orderId} was not found for delivery ${delivery.id}`)
  }
  const downloadAvailability = await getBuyerDigitalDownloadAvailabilityForPaidOrder({
    orderId: order.id,
    absoluteUrls: true,
  })

  const shippingAddress = order.addresses.find((address) => address.type === 'SHIPPING')
  const message = await buildOrderConfirmationEmailMessage({
    orderId: order.id,
    orderNumber: order.orderNumber,
    email: delivery.recipientEmail,
    currency: order.currency,
    total: centsToDollars(order.totalCents ?? dollarsToCents((order as { total?: number }).total ?? 0)),
    items: order.items.map((item) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      price: centsToDollars(item.priceCents ?? dollarsToCents((item as { price?: number }).price ?? 0)),
    })),
    shippingAddress: shippingAddress
      ? {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address1,
          city: shippingAddress.city,
          province: shippingAddress.province,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
        }
      : null,
    ...(downloadAvailability.hasDigitalItems
      ? {
          digitalDownloads: downloadAvailability.downloads,
          digitalDownloadsPending: downloadAvailability.pending,
        }
      : {}),
  })

  // Template disabled — skip send and surface a clear failure so it is visible in the delivery log.
  if (!message) {
    await markEmailDeliveryFailed({
      deliveryId: delivery.id,
      error: new Error('Order confirmation email template is disabled. Enable it in Settings → Email.'),
      retryable: false,
    })
    return
  }

  try {
    const result = await sendTransactionalEmail({
      from: message.from,
      to: [delivery.recipientEmail],
      subject: message.subject,
      html: message.html,
    })

    // Provider in 'preview' mode means no real API key is configured.
    // Surface this as a failure so it appears in delivery logs.
    if (result.provider === 'preview') {
      await markEmailDeliveryFailed({
        deliveryId: delivery.id,
        error: new Error('No email provider configured. Set up Resend in Settings → Email to send real emails.'),
        retryable: false,
      })
      return
    }

    await markEmailDeliverySent({
      deliveryId: delivery.id,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    })
  } catch (error) {
    await markEmailDeliveryFailed({
      deliveryId: delivery.id,
      error,
      retryable: true,
    })
    throw error
  }
}

export async function processFulfillmentTrackingEmailDeliveryJob(input: {
  deliveryId: string
  fulfillmentId: string
  orderId?: string
}) {
  const delivery = await emailDeliveryClient().findUnique({
    where: { id: input.deliveryId },
    select: {
      id: true,
      event: true,
      template: true,
      recipientEmail: true,
      subject: true,
      status: true,
      provider: true,
      orderId: true,
      customerId: true,
      refundId: true,
      returnId: true,
    },
  })

  if (!delivery || delivery.status === 'SENT') {
    return
  }

  const orderId = input.orderId ?? delivery.orderId
  if (!orderId) {
    throw new Error('Fulfillment delivery is missing linked order context')
  }

  const [order, fulfillment] = await Promise.all([
    getOrderById(orderId),
    prisma.fulfillment.findUnique({
      where: { id: input.fulfillmentId },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                title: true,
                variantTitle: true,
              },
            },
          },
        },
      },
    }),
  ])

  if (!order) {
    throw new Error(`Order ${orderId} was not found for delivery ${delivery.id}`)
  }

  if (!fulfillment || fulfillment.orderId !== order.id) {
    throw new Error(`Fulfillment ${input.fulfillmentId} is not valid for order ${order.id}`)
  }

  const message = await buildFulfillmentTrackingEmailMessage({
    orderNumber: order.orderNumber,
    email: delivery.recipientEmail,
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    items: fulfillment.items.map((item) => ({
      title: item.orderItem?.title || 'Item',
      variantTitle: item.orderItem?.variantTitle,
      quantity: item.quantity,
    })),
  })

  // Template disabled — skip send and surface a clear failure so it is visible in the delivery log.
  if (!message) {
    await markEmailDeliveryFailed({
      deliveryId: delivery.id,
      error: new Error('Shipping confirmation email template is disabled. Enable it in Settings → Email.'),
      retryable: false,
    })
    return
  }

  try {
    const result = await sendTransactionalEmail({
      from: message.from,
      to: [delivery.recipientEmail],
      subject: message.subject,
      html: message.html,
    })

    // Provider in 'preview' mode means no real API key is configured.
    // Surface this as a failure so it appears in delivery logs.
    if (result.provider === 'preview') {
      await markEmailDeliveryFailed({
        deliveryId: delivery.id,
        error: new Error('No email provider configured. Set up Resend in Settings → Email to send real emails.'),
        retryable: false,
      })
      return
    }

    await markEmailDeliverySent({
      deliveryId: delivery.id,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    })
  } catch (error) {
    await markEmailDeliveryFailed({
      deliveryId: delivery.id,
      error,
      retryable: true,
    })
    throw error
  }
}

export async function getEmailDeliveryById(id: string): Promise<EmailDeliveryDiagnostics | null> {
  const delivery = await emailDeliveryClient().findUnique({
    where: { id },
    select: emailDeliveryListSelect,
  })

  if (!delivery) {
    return null
  }

  const order = delivery.orderId
    ? await prisma.order.findUnique({
        where: { id: delivery.orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          totalCents: true,
          currency: true,
          createdAt: true,
        },
      })
    : null

  const blockers = resendPolicyBlockers(delivery)

  return {
    delivery,
    resendPolicy: {
      canResend: blockers.length === 0,
      eligibleStatuses: [...EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES],
      blockers,
    },
    related: {
      order: order
        ? {
            ...order,
            total: centsToDollars(order.totalCents ?? dollarsToCents((order as { total?: number }).total ?? 0)),
            totalCents:
              order.totalCents ?? dollarsToCents((order as { total?: number }).total ?? 0),
          }
        : null,
    },
  }
}

export async function resendEmailDelivery(id: string): Promise<ResendEmailDeliveryResult> {
  const existing = await emailDeliveryClient().findUnique({
    where: { id },
    select: emailDeliveryListSelect,
  })

  if (!existing) {
    return { success: false, reason: 'NOT_FOUND', message: 'Email delivery not found' }
  }

  const blockers = resendPolicyBlockers(existing)
  if (blockers.length > 0) {
    return {
      success: false,
      reason: 'NOT_RESENDABLE',
      message: blockers[0],
      blockers,
    }
  }

  if (existing.template !== 'order_confirmation' || !existing.orderId) {
    return {
      success: false,
      reason: 'UNSUPPORTED_TEMPLATE',
      message: 'Only order confirmation deliveries support safe resend right now',
    }
  }

  const order = await getOrderById(existing.orderId)
  if (!order) {
    return {
      success: false,
      reason: 'MISSING_CONTEXT',
      message: 'The linked order could not be found for this email delivery',
    }
  }
  const downloadAvailability = await getBuyerDigitalDownloadAvailabilityForPaidOrder({
    orderId: order.id,
    absoluteUrls: true,
  })

  const shippingAddress = order.addresses.find((address) => address.type === 'SHIPPING')
  const message = await buildOrderConfirmationEmailMessage({
    orderId: order.id,
    orderNumber: order.orderNumber,
    email: existing.recipientEmail,
    currency: order.currency,
    total: centsToDollars(order.totalCents ?? dollarsToCents((order as { total?: number }).total ?? 0)),
    items: order.items.map((item) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      price: centsToDollars(item.priceCents ?? dollarsToCents((item as { price?: number }).price ?? 0)),
    })),
    shippingAddress: shippingAddress
      ? {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address1,
          city: shippingAddress.city,
          province: shippingAddress.province,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
        }
      : null,
    ...(downloadAvailability.hasDigitalItems
      ? {
          digitalDownloads: downloadAvailability.downloads,
          digitalDownloadsPending: downloadAvailability.pending,
        }
      : {}),
  })

  if (!message) {
    return {
      success: false,
      reason: 'UNSUPPORTED_TEMPLATE' as const,
      message: 'Order confirmation email template is currently disabled.',
    }
  }

  const delivery = await sendTrackedEmail({
    event: existing.event,
    template: existing.template,
    recipientEmail: existing.recipientEmail,
    subject: existing.subject || message.subject,
    from: message.from,
    html: message.html,
    provider: existing.provider,
    orderId: existing.orderId ?? undefined,
    customerId: existing.customerId ?? undefined,
    refundId: existing.refundId ?? undefined,
    returnId: existing.returnId ?? undefined,
  })

  return { success: true, delivery }
}

import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

import type { ShippingRateQuote } from '@/server/shipping/shipping-rate.types'

const SHIPPING_QUOTE_TTL_MS = 15 * 60 * 1000
const SHIPPING_QUOTE_ID_PREFIX = 'shipping-quote_'

type CheckoutAddressFingerprintInput = {
  firstName?: string
  lastName?: string
  company?: string
  address1: string
  address2?: string
  city: string
  province?: string
  postalCode: string
  country: string
  phone?: string
}

type CheckoutLineItemFingerprintInput = {
  variantId: string
  quantity: number
  priceCents: number
}

export type StoredCheckoutShippingQuote = {
  quoteId: string
  originalQuoteId: string
  source: ShippingRateQuote['source']
  provider: 'EASYPOST' | 'SHIPPO' | null
  providerShipmentId?: string
  providerRateId?: string
  service?: string
  carrier?: string
  amountCents: number
  currency: string
  estimatedDeliveryText?: string
  cartFingerprint: string
  addressFingerprint: string
  expiresAt: Date
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

function getProviderShipmentId(quote: ShippingRateQuote) {
  if (quote.providerShipmentId?.trim()) return quote.providerShipmentId.trim()
  const metadataShipmentId = quote.metadata?.shipmentId
  return typeof metadataShipmentId === 'string' && metadataShipmentId.trim()
    ? metadataShipmentId.trim()
    : undefined
}

export function buildCheckoutCartFingerprint(
  lineItems: CheckoutLineItemFingerprintInput[]
) {
  const normalized = [...lineItems]
    .map((item) => ({
      variantId: normalize(item.variantId),
      quantity: Number(item.quantity || 0),
      priceCents: Number(item.priceCents || 0),
    }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId))
  return hashJson(normalized)
}

export function buildCheckoutAddressFingerprint(
  address: CheckoutAddressFingerprintInput
) {
  return hashJson({
    firstName: normalize(address.firstName),
    lastName: normalize(address.lastName),
    company: normalize(address.company),
    address1: normalize(address.address1),
    address2: normalize(address.address2),
    city: normalize(address.city),
    province: normalize(address.province),
    postalCode: normalize(address.postalCode),
    country: normalize(address.country),
    phone: normalize(address.phone),
  })
}

export function isCheckoutShippingQuoteId(value: string | null | undefined) {
  return String(value ?? '').startsWith(SHIPPING_QUOTE_ID_PREFIX)
}

export async function storeCheckoutShippingQuote(input: {
  quote: ShippingRateQuote
  cartFingerprint: string
  addressFingerprint: string
  now?: Date
  ttlMs?: number
}) {
  const now = input.now ?? new Date()

  const ttlMs = Number.isFinite(input.ttlMs) ? Math.max(1000, Number(input.ttlMs)) : SHIPPING_QUOTE_TTL_MS
  const quoteId = `${SHIPPING_QUOTE_ID_PREFIX}${randomUUID().replaceAll('-', '')}`
  const providerShipmentId = getProviderShipmentId(input.quote)
  const provider =
    input.quote.source === 'EASYPOST' || input.quote.source === 'SHIPPO'
      ? input.quote.source
      : null

  const storedQuote: StoredCheckoutShippingQuote = {
    quoteId,
    originalQuoteId: input.quote.id,
    source: input.quote.source,
    provider,
    providerShipmentId,
    providerRateId: input.quote.providerRateId?.trim() || undefined,
    service: input.quote.service?.trim() || undefined,
    carrier: input.quote.carrier?.trim() || undefined,
    amountCents: input.quote.amountCents,
    currency: normalize(input.quote.currency || 'USD') || 'USD',
    estimatedDeliveryText: input.quote.estimatedDeliveryText?.trim() || undefined,
    cartFingerprint: input.cartFingerprint,
    addressFingerprint: input.addressFingerprint,
    expiresAt: new Date(now.getTime() + ttlMs),
  }

  const { quoteId: opaqueToken, expiresAt, ...snapshot } = storedQuote
  await prisma.checkoutShippingQuote.create({
    data: {
      tokenHash: hashJson(opaqueToken),
      snapshot: Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined)) as Prisma.InputJsonObject,
      expiresAt,
    },
  })
  return storedQuote
}

export async function getStoredCheckoutShippingQuote(quoteId: string, now = new Date()): Promise<StoredCheckoutShippingQuote | null> {
  if (!isCheckoutShippingQuoteId(quoteId)) return null
  const quote = await prisma.checkoutShippingQuote.findUnique({ where: { tokenHash: hashJson(quoteId) } })
  if (!quote || quote.expiresAt <= now) return null
  return { ...(quote.snapshot as unknown as Omit<StoredCheckoutShippingQuote, 'quoteId' | 'expiresAt'>), quoteId, expiresAt: quote.expiresAt }
}

/** Bounded maintenance, never an O(n) sweep on checkout requests. */
export async function pruneExpiredCheckoutShippingQuotes(now = new Date(), limit = 500) {
  const expired = await prisma.checkoutShippingQuote.findMany({
    where: { expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' }, take: Math.min(1000, Math.max(1, limit)),
    select: { tokenHash: true },
  })
  if (!expired.length) return 0
  const result = await prisma.checkoutShippingQuote.deleteMany({ where: { tokenHash: { in: expired.map(quote => quote.tokenHash) } } })
  return result.count
}

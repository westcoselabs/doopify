import { describe, expect, it, vi } from 'vitest'
const { quoteRows } = vi.hoisted(() => ({ quoteRows: new Map<string, any>() }))
vi.mock('@/lib/prisma', () => ({ prisma: { checkoutShippingQuote: {
  create: vi.fn(async ({ data }) => { quoteRows.set(data.tokenHash, data); return data }),
  findUnique: vi.fn(async ({ where }) => quoteRows.get(where.tokenHash) ?? null),
} } }))

import {
  buildCheckoutAddressFingerprint,
  buildCheckoutCartFingerprint,
  getStoredCheckoutShippingQuote,
  isCheckoutShippingQuoteId,
  storeCheckoutShippingQuote,
} from './shipping-quote-cache'

const address = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Compute Way',
  city: 'London',
  postalCode: 'N1 1AA',
  country: 'GB',
}

const lineItems = [
  {
    variantId: 'variant_1',
    quantity: 2,
    priceCents: 2500,
  },
]

describe('shipping-quote-cache', () => {
  it('stores and loads provider-backed quotes by server-owned quote id', async () => {
    quoteRows.clear()

    const cartFingerprint = buildCheckoutCartFingerprint(lineItems)
    const addressFingerprint = buildCheckoutAddressFingerprint(address)
    const stored = await storeCheckoutShippingQuote({
      quote: {
        id: 'shippo_rate_1',
        source: 'SHIPPO',
        displayName: 'USPS Priority',
        amountCents: 1400,
        currency: 'USD',
        providerRateId: 'shippo_rate_1',
        providerShipmentId: 'shippo_shipment_1',
      },
      cartFingerprint,
      addressFingerprint,
    })

    expect(isCheckoutShippingQuoteId(stored.quoteId)).toBe(true)
    expect([...quoteRows.keys()]).not.toContain(stored.quoteId)
    expect(await getStoredCheckoutShippingQuote(stored.quoteId)).toMatchObject({
      originalQuoteId: 'shippo_rate_1',
      providerRateId: 'shippo_rate_1',
      providerShipmentId: 'shippo_shipment_1',
      amountCents: 1400,
      currency: 'USD',
    })
  })

  it('expires quotes by ttl', async () => {
    quoteRows.clear()

    const now = new Date('2026-05-07T12:00:00.000Z')
    const cartFingerprint = buildCheckoutCartFingerprint(lineItems)
    const addressFingerprint = buildCheckoutAddressFingerprint(address)
    const stored = await storeCheckoutShippingQuote({
      quote: {
        id: 'easypost_rate_1',
        source: 'EASYPOST',
        displayName: 'UPS Ground',
        amountCents: 1200,
        currency: 'USD',
        providerRateId: 'easypost_rate_1',
      },
      cartFingerprint,
      addressFingerprint,
      now,
      ttlMs: 1000,
    })

    expect(await getStoredCheckoutShippingQuote(stored.quoteId, new Date(now.getTime() + 500))).toBeTruthy()
    expect(await getStoredCheckoutShippingQuote(stored.quoteId, new Date(now.getTime() + 2000))).toBeNull()
  })
})

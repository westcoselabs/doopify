import { afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { storeCheckoutShippingQuote, getStoredCheckoutShippingQuote, pruneExpiredCheckoutShippingQuotes } from './shipping-quote-cache'

const suite = process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST ? describe : describe.skip
suite('shared shipping quote snapshots', () => {
  afterEach(() => prisma.checkoutShippingQuote.deleteMany())
  it('survives module replacement and observes shared expiry with bounded cleanup', async () => {
    const stored = await storeCheckoutShippingQuote({ quote: { id: 'rate', source: 'SHIPPO', displayName: 'Ground', amountCents: 599, currency: 'USD', providerRateId: 'provider-rate' }, cartFingerprint: 'cart', addressFingerprint: 'address' })
    vi.resetModules()
    const otherReplica = await import('./shipping-quote-cache')
    expect(await otherReplica.getStoredCheckoutShippingQuote(stored.quoteId)).toEqual(stored)
    const rows = await prisma.checkoutShippingQuote.findMany()
    expect(rows.some(row => row.tokenHash === stored.quoteId)).toBe(false)
    await prisma.checkoutShippingQuote.updateMany({ data: { expiresAt: new Date(0) } })
    expect(await getStoredCheckoutShippingQuote(stored.quoteId)).toBeNull()
    expect(await pruneExpiredCheckoutShippingQuotes(new Date(), 1)).toBe(1)
  })
})

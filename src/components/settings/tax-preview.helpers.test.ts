import { describe, expect, it } from 'vitest'
import { calculateTaxPreview } from './tax-preview.helpers'
import { calculateTax } from '@/lib/checkout/pricing'
const preview = { subtotal: '100', shippingAmount: '10', country: 'US', province: 'CA' }
const base = { enabled: true, strategy: 'MANUAL' as const, defaultTaxRatePercent: 10, taxShipping: false, pricesIncludeTax: false }
describe('tax preview checkout parity', () => {
  for (const enabled of [true, false]) for (const strategy of ['NONE', 'MANUAL'] as const) for (const taxShipping of [true, false]) for (const pricesIncludeTax of [true, false]) {
    it(JSON.stringify({ enabled, strategy, taxShipping, pricesIncludeTax }), () => {
      const settings = { ...base, enabled, strategy, taxShipping, pricesIncludeTax }
      const actual = calculateTax({ taxableSubtotalCents: 10000, shippingAmountCents: 1000, shippingAddress: preview, taxSettings: { ...settings, defaultTaxRateBps: 1000 } })
      const result = calculateTaxPreview(preview, settings, [{ name: 'Conflicting legacy rule', ratePercent: 30, countryCode: 'US' }])
      expect(result.estimatedTax * 100).toBeCloseTo(actual.amountCents)
      expect(result.totalWithTax * 100).toBeCloseTo(11000 + (pricesIncludeTax ? 0 : actual.amountCents))
    })
  }
  it('extracts inclusive tax without increasing the total', () => {
    const result = calculateTaxPreview({ ...preview, subtotal: '110', shippingAmount: '0' }, { ...base, pricesIncludeTax: true })
    expect(result.estimatedTax).toBe(10)
    expect(result.totalWithTax).toBe(110)
  })
  it('rounds in integer minor units', () => {
    expect(calculateTaxPreview({ ...preview, subtotal: '0.05', shippingAmount: '0' }, base).estimatedTax).toBe(0.01)
  })
  it('rejects invalid input', () => {
    expect(() => calculateTaxPreview({ ...preview, subtotal: '-1' }, base)).toThrow('Subtotal')
    expect(() => calculateTaxPreview({ ...preview, shippingAmount: 'NaN' }, base)).toThrow('Shipping amount')
    expect(() => calculateTaxPreview(preview, { ...base, defaultTaxRatePercent: 101 })).toThrow('Tax rate')
  })
})

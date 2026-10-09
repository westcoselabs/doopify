import { describe, expect, it } from 'vitest'
import { manualRatePayload, mergeShippingEntity } from './shipping-settings.helpers'

describe('shipping editor persistence', () => {
  const base = { name: 'Standard', regionCountry: 'us', regionStateProvince: '', rateType: 'PRICE_BASED', amount: '5', minWeight: '1', maxWeight: '10', minSubtotal: '', maxSubtotal: '', freeOverAmount: '50', estimatedDeliveryText: '', isActive: true }
  it('serializes cleared and inapplicable limits as null instead of omitting them', () => {
    expect(JSON.parse(JSON.stringify(manualRatePayload(base)))).toMatchObject({ minWeight: null, maxWeight: null, minSubtotal: null, maxSubtotal: null, freeOverAmount: null })
    expect(manualRatePayload({ ...base, rateType: 'FREE' })).toMatchObject({ amount: 0, freeOverAmount: 50, maxWeight: null })
    expect(manualRatePayload({ ...base, maxSubtotal: '0' }).maxSubtotal).toBe(0)
  })
  it('merges one saved entity without replacing unrelated settings and converts cents', () => {
    const packages = [{ id: 'package' }]
    const settings = { shippingMode: 'MANUAL', shippingPackages: packages, shippingManualRates: [{ id: 'rate', amount: 5 }] }
    const result = mergeShippingEntity(settings, '/api/settings/shipping/manual-rates/rate', 'PATCH', { id: 'rate', amountCents: 725, freeOverAmountCents: null })
    expect(result.shippingPackages).toBe(packages)
    expect(result.shippingMode).toBe('MANUAL')
    expect(result.shippingManualRates).toEqual([{ id: 'rate', amountCents: 725, amount: 7.25, freeOverAmountCents: null, freeOverAmount: null }])
  })
  it('updates peer defaults and removes only the deleted entity', () => {
    const settings = { shippingPackages: [{ id: 'a', isDefault: true }] }
    const added = mergeShippingEntity(settings, '/api/settings/shipping/packages', 'POST', { id: 'b', isDefault: true })
    expect(added.shippingPackages.find((row: { id: string; isDefault?: boolean }) => row.id === 'a')?.isDefault).toBe(false)
    expect(mergeShippingEntity(added, '/api/settings/shipping/packages/b', 'DELETE', null).shippingPackages).toHaveLength(1)
  })
})

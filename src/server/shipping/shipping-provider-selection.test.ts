import { describe, expect, it, vi } from 'vitest'
const env = vi.hoisted(() => ({ SHIPPING_RATE_PROVIDER: 'none', SHIPPING_LABEL_PROVIDER: 'none' }))
vi.mock('@/lib/env', () => ({ env }))
import { getShippingProviderSelection } from './shipping-provider-selection'
describe('shipping provider selection', () => {
  it('keeps live-rate and label selection independent', () => {
    env.SHIPPING_RATE_PROVIDER = 'shippo'
    env.SHIPPING_LABEL_PROVIDER = 'easypost'
    expect(getShippingProviderSelection()).toEqual({ rateProvider: 'SHIPPO', labelProvider: 'EASYPOST' })
  })
  it('does not infer a live-rate provider from a label provider', () => {
    env.SHIPPING_RATE_PROVIDER = 'none'
    env.SHIPPING_LABEL_PROVIDER = 'shippo'
    expect(getShippingProviderSelection()).toEqual({ rateProvider: null, labelProvider: 'SHIPPO' })
  })
})

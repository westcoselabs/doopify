import { describe, expect, it } from 'vitest'

import {
  buildLegacyProviderFields,
  resolveActiveRateProvider,
} from './shipping-provider-selection'

describe('shipping provider selection', () => {
  it('returns SHIPPO when activeRateProvider is SHIPPO', () => {
    expect(
      resolveActiveRateProvider({
        activeRateProvider: 'SHIPPO',
        shippingLiveProvider: null,
        shippingProviderUsage: 'LIVE_AND_LABELS',
      })
    ).toBe('SHIPPO')
  })

  it('falls back to shippingLiveProvider when activeRateProvider is not selected and usage allows live rates', () => {
    expect(
      resolveActiveRateProvider({
        activeRateProvider: 'NONE',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LIVE_AND_LABELS',
      })
    ).toBe('SHIPPO')
  })

  it('returns null when shippingProviderUsage is LABELS_ONLY', () => {
    expect(
      resolveActiveRateProvider({
        activeRateProvider: 'NONE',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LABELS_ONLY',
      })
    ).toBeNull()
  })

  it('builds compatible legacy fields for Shippo live-rate selection', () => {
    expect(
      buildLegacyProviderFields({
        activeRateProvider: 'SHIPPO',
        labelProvider: 'SHIPPO',
      })
    ).toEqual({
      shippingLiveProvider: 'SHIPPO',
      shippingProviderUsage: 'LIVE_AND_LABELS',
    })
  })
})

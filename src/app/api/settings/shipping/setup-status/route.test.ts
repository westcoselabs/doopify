import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getShippingSetupStore: vi.fn(),
  buildShippingSetupStatus: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/shipping/shipping-setup.service', () => ({
  getShippingSetupStore: mocks.getShippingSetupStore,
  buildShippingSetupStatus: mocks.buildShippingSetupStatus,
}))

import { GET } from './route'

describe('settings shipping setup-status route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/settings/shipping/setup-status'))
    expect(response.status).toBe(401)
    expect(mocks.getShippingSetupStore).not.toHaveBeenCalled()
  })

  it('GET exposes missing setup flags for origin/package/provider', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'staff_1', email: 'staff@example.com', role: 'STAFF' },
    })
    mocks.getShippingSetupStore.mockResolvedValue({ id: 'store_1' })
    mocks.buildShippingSetupStatus.mockResolvedValue({
      shippingMode: 'HYBRID',
      shippingLiveProvider: 'SHIPPO',
      shippingProviderUsage: 'LIVE_AND_LABELS',
      mode: 'HYBRID',
      hasOriginAddress: false,
      hasDefaultPackage: false,
      hasManualRates: true,
      hasFallbackRate: false,
      hasProvider: true,
      providerConnected: false,
      providerLastVerifiedAt: null,
      providerLastError: null,
      providerVerificationStatus: 'needs_setup',
      canUseManualRates: true,
      canUseLiveRates: false,
      canBuyLabels: false,
      warnings: ['Shipping origin address is incomplete.'],
      nextSteps: ['Add origin address details in setup step 2.'],
    })

    const response = await GET(new Request('http://localhost/api/settings/shipping/setup-status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'HYBRID',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LIVE_AND_LABELS',
        hasOriginAddress: false,
        hasDefaultPackage: false,
        hasFallbackRate: false,
        hasProvider: true,
        providerConnected: false,
        providerVerificationStatus: 'needs_setup',
      },
    })
  })
})

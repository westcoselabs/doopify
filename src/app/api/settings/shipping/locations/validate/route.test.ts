import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getStoreSettingsLite: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

import { POST } from './route'

describe('POST /api/settings/shipping/locations/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns non-fatal unavailable message when provider validation is not implemented', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStoreSettingsLite.mockResolvedValue({
      shippingLiveProvider: 'SHIPPO',
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/locations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address1: '123 Main St',
          city: 'Los Angeles',
          stateProvince: 'CA',
          postalCode: '90001',
          country: 'US',
        }),
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        supported: false,
        valid: null,
        message:
          'Address pre-validation is not available yet. Save this address, then verify it by loading live checkout rates or purchasing a test label.',
      },
    })
  })
})


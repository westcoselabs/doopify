import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getStoreSettingsLite: vi.fn(),
  updateStoreSettings: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
  updateStoreSettings: mocks.updateStoreSettings,
}))

import { PATCH } from './route'

function storeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store_1',
    name: 'Doopify',
    email: 'support@example.com',
    phone: '',
    domain: '',
    currency: 'USD',
    timezone: 'America/New_York',
    shippingThresholdCents: 10000,
    shippingDomesticRateCents: 999,
    shippingInternationalRateCents: 1999,
    defaultTaxRateBps: 0,
    ...overrides,
  }
}

describe('PATCH /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unsupported currency values', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER' },
    })

    const response = await PATCH(
      new Request('http://localhost/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: 'JPY' }),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.updateStoreSettings).not.toHaveBeenCalled()
  })

  it('rejects unsupported timezone values', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER' },
    })

    const response = await PATCH(
      new Request('http://localhost/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: 'Mars/Phobos' }),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.updateStoreSettings).not.toHaveBeenCalled()
  })

  it('accepts supported currency/timezone values and persists them', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER' },
    })
    mocks.getStoreSettingsLite.mockResolvedValue(storeFixture())
    mocks.updateStoreSettings.mockResolvedValue(
      storeFixture({ currency: 'CAD', timezone: 'America/Chicago' })
    )

    const response = await PATCH(
      new Request('http://localhost/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: 'CAD', timezone: 'America/Chicago' }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.updateStoreSettings).toHaveBeenCalledWith(
      'store_1',
      expect.objectContaining({
        currency: 'CAD',
        timezone: 'America/Chicago',
      })
    )
  })
})

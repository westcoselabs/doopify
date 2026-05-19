import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getShippingSettingsStore: vi.fn(),
  updateShippingSettings: vi.fn(),
  auditActorFromUser: vi.fn(),
  recordAuditLogBestEffort: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/shipping/shipping-settings.service', () => ({
  getShippingSettingsStore: mocks.getShippingSettingsStore,
  updateShippingSettings: mocks.updateShippingSettings,
}))

vi.mock('@/server/services/audit-log.service', () => ({
  auditActorFromUser: mocks.auditActorFromUser,
  recordAuditLogBestEffort: mocks.recordAuditLogBestEffort,
}))

import { GET, PATCH } from './route'

function storeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store_1',
    email: 'store@example.com',
    supportEmail: 'support@example.com',
    shippingMode: 'MANUAL',
    shippingLiveProvider: null,
    shippingProviderUsage: 'LIVE_AND_LABELS',
    activeRateProvider: 'NONE',
    labelProvider: 'NONE',
    fallbackBehavior: 'SHOW_FALLBACK',
    shippingThresholdCents: 10000,
    shippingDomesticRateCents: 999,
    shippingInternationalRateCents: 1999,
    manualFulfillmentInstructions: null,
    manualTrackingBehavior: null,
    localDeliveryEnabled: false,
    localDeliveryPriceCents: null,
    localDeliveryMinimumOrderCents: null,
    localDeliveryCoverage: null,
    localDeliveryInstructions: null,
    pickupEnabled: false,
    pickupLocation: null,
    pickupInstructions: null,
    pickupEstimate: null,
    packingSlipUseLogo: true,
    packingSlipShowSku: true,
    packingSlipShowProductImages: false,
    packingSlipFooterNote: null,
    shippingPackages: [],
    shippingLocations: [],
    shippingManualRates: [],
    shippingFallbackRates: [],
    shippingZones: [
      {
        id: 'zone_1',
        name: 'US',
        countryCode: 'US',
        provinceCode: null,
        isActive: true,
        priority: 100,
        rates: [
          {
            id: 'rate_1',
            name: 'Standard',
            method: 'FLAT',
            amountCents: 1299,
            minSubtotalCents: null,
            maxSubtotalCents: null,
            isActive: true,
            priority: 100,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('settings shipping route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auditActorFromUser.mockImplementation((user) => user)
    mocks.recordAuditLogBestEffort.mockResolvedValue(null)
  })

  it('GET /api/settings/shipping requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(response.status).toBe(401)
    expect(mocks.getShippingSettingsStore).not.toHaveBeenCalled()
  })

  it('PATCH /api/settings/shipping requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })

    const response = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingDomesticRate: 12.99 }),
      })
    )

    expect(response.status).toBe(403)
    expect(mocks.updateShippingSettings).not.toHaveBeenCalled()
  })

  it('PATCH saves dollar values as integer cents', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getShippingSettingsStore.mockResolvedValue(storeFixture())
    mocks.updateShippingSettings.mockResolvedValue(
      storeFixture({
        shippingDomesticRateCents: 1249,
        shippingInternationalRateCents: 3050,
        shippingThresholdCents: 15000,
      })
    )

    const response = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingDomesticRate: 12.49,
          shippingInternationalRate: 30.5,
          shippingThreshold: 150,
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.updateShippingSettings).toHaveBeenCalledWith('store_1', {
      shippingDomesticRateCents: 1249,
      shippingInternationalRateCents: 3050,
      shippingThresholdCents: 15000,
    })
    expect(mocks.recordAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'shipping.settings_updated',
      })
    )

    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingDomesticRate: 12.49,
        shippingInternationalRate: 30.5,
        shippingThreshold: 150,
      },
    })
  })

  it('GET returns rates as dollars', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'staff_1', email: 'staff@example.com', role: 'STAFF' },
    })
    mocks.getShippingSettingsStore.mockResolvedValue(storeFixture())

    const response = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingDomesticRate: 9.99,
        shippingInternationalRate: 19.99,
        shippingThreshold: 100,
        activeRateProvider: 'NONE',
        labelProvider: 'NONE',
        fallbackBehavior: 'SHOW_FALLBACK',
        shippingZones: [
          {
            rates: [{ amount: 12.99 }],
          },
        ],
      },
    })
  })

  it('GET includes persisted shipping packages in settings response', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getShippingSettingsStore.mockResolvedValue(
      storeFixture({
        shippingPackages: [
          {
            id: 'pkg_1',
            name: 'Small box',
            type: 'BOX',
            length: 10,
            width: 8,
            height: 4,
            dimensionUnit: 'IN',
            emptyPackageWeight: 6,
            weightUnit: 'OZ',
            isDefault: true,
            isActive: true,
            createdAt: '2026-05-06T00:00:00.000Z',
            updatedAt: '2026-05-06T00:00:00.000Z',
          },
        ],
      })
    )

    const response = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingPackages: [
          {
            id: 'pkg_1',
            name: 'Small box',
            type: 'BOX',
          },
        ],
      },
    })
  })

  it('GET includes ship-from location email and store support email', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getShippingSettingsStore.mockResolvedValue(
      storeFixture({
        email: 'store@example.com',
        phone: '555-1212',
        supportEmail: 'support@example.com',
        shippingLocations: [
          {
            id: 'loc_1',
            name: 'Warehouse',
            contactName: 'Ops',
            email: 'shipping@example.com',
            company: null,
            address1: '10 Main St',
            address2: null,
            city: 'Austin',
            stateProvince: 'TX',
            postalCode: '78701',
            country: 'US',
            phone: null,
            isDefault: true,
            isActive: true,
            createdAt: '2026-05-06T00:00:00.000Z',
            updatedAt: '2026-05-06T00:00:00.000Z',
          },
        ],
      })
    )

    const response = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        email: 'store@example.com',
        phone: '555-1212',
        supportEmail: 'support@example.com',
        shippingLocations: [{ id: 'loc_1', email: 'shipping@example.com' }],
      },
    })
  })

  it('PATCH persists shipping mode LIVE_RATES and returns it on subsequent GET', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(storeFixture())
    mocks.updateShippingSettings.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'LIVE_RATES',
      })
    )

    const patchResponse = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMode: 'LIVE_RATES' }),
      })
    )
    expect(patchResponse.status).toBe(200)
    expect(mocks.updateShippingSettings).toHaveBeenCalledWith('store_1', {
      shippingMode: 'LIVE_RATES',
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'LIVE_RATES',
      })
    )
    const getResponse = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(getResponse.status).toBe(200)
    const payload = await getResponse.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'LIVE_RATES',
      },
    })
  })

  it('PATCH persists shipping mode HYBRID and provider usage mapping for labels-only usage', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(storeFixture())
    mocks.updateShippingSettings.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'HYBRID',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LABELS_ONLY',
        activeRateProvider: 'NONE',
        labelProvider: 'SHIPPO',
      })
    )

    const response = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingMode: 'HYBRID',
          shippingLiveProvider: 'SHIPPO',
          shippingProviderUsage: 'LABELS_ONLY',
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.updateShippingSettings).toHaveBeenCalledWith(
      'store_1',
      expect.objectContaining({
        shippingMode: 'HYBRID',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LABELS_ONLY',
        activeRateProvider: 'NONE',
        labelProvider: 'SHIPPO',
      })
    )

    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'HYBRID',
        shippingProviderUsage: 'LABELS_ONLY',
        activeRateProvider: 'NONE',
        labelProvider: 'SHIPPO',
      },
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'HYBRID',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LABELS_ONLY',
        activeRateProvider: 'NONE',
        labelProvider: 'SHIPPO',
      })
    )
    const getResponse = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(getResponse.status).toBe(200)
    const getPayload = await getResponse.json()
    expect(getPayload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'HYBRID',
        shippingProviderUsage: 'LABELS_ONLY',
        activeRateProvider: 'NONE',
        labelProvider: 'SHIPPO',
      },
    })
  })

  it('PATCH persists shipping mode MANUAL and returns it on subsequent GET', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'LIVE_RATES',
        activeRateProvider: 'SHIPPO',
        labelProvider: 'SHIPPO',
        shippingLiveProvider: 'SHIPPO',
        shippingProviderUsage: 'LIVE_AND_LABELS',
      })
    )
    mocks.updateShippingSettings.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'MANUAL',
        activeRateProvider: 'NONE',
        labelProvider: 'NONE',
        shippingLiveProvider: null,
        shippingProviderUsage: 'LIVE_AND_LABELS',
      })
    )

    const patchResponse = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingMode: 'MANUAL',
          activeRateProvider: 'NONE',
          labelProvider: 'NONE',
          fallbackBehavior: 'SHOW_FALLBACK',
          shippingLiveProvider: null,
          shippingProviderUsage: 'LIVE_AND_LABELS',
        }),
      })
    )
    expect(patchResponse.status).toBe(200)

    mocks.getShippingSettingsStore.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'MANUAL',
      })
    )
    const getResponse = await GET(new Request('http://localhost/api/settings/shipping'))
    expect(getResponse.status).toBe(200)
    const payload = await getResponse.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'MANUAL',
      },
    })
  })

  it('PATCH keeps LIVE_RATES instead of silently resetting to MANUAL when requirements are missing', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.getShippingSettingsStore.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'MANUAL',
        shippingPackages: [],
        shippingLocations: [],
        activeRateProvider: 'NONE',
        labelProvider: 'NONE',
      })
    )
    mocks.updateShippingSettings.mockResolvedValueOnce(
      storeFixture({
        shippingMode: 'LIVE_RATES',
        shippingPackages: [],
        shippingLocations: [],
        activeRateProvider: 'NONE',
        labelProvider: 'NONE',
      })
    )

    const response = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMode: 'LIVE_RATES' }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.updateShippingSettings).toHaveBeenCalledWith('store_1', {
      shippingMode: 'LIVE_RATES',
    })
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        shippingMode: 'LIVE_RATES',
      },
    })
  })

  it('PATCH returns a clear save error when persistence fails', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getShippingSettingsStore.mockResolvedValueOnce(storeFixture())
    mocks.updateShippingSettings.mockRejectedValueOnce(new Error('Failed to save shipping mode'))

    const response = await PATCH(
      new Request('http://localhost/api/settings/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMode: 'HYBRID' }),
      })
    )

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: false,
      error: 'Failed to save shipping mode',
    })
  })
})

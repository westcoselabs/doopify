import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: {
      findFirst: vi.fn(),
    },
  },
  getShippingProviderConnectionStatus: vi.fn(),
  getProviderStatus: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

vi.mock('@/server/shipping/shipping-provider.service', () => ({
  getShippingProviderConnectionStatus: mocks.getShippingProviderConnectionStatus,
}))
vi.mock('@/server/services/provider-connection.service', () => ({
  getProviderStatus: mocks.getProviderStatus,
}))

import { buildShippingSetupStatus } from './shipping-setup.service'

function storeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store_1',
    email: 'store@example.com',
    supportEmail: 'support@example.com',
    phone: '555-000-0000',
    shippingMode: 'MANUAL',
    shippingLiveProvider: null,
    shippingProviderUsage: 'LIVE_AND_LABELS',
    activeRateProvider: 'NONE',
    labelProvider: 'NONE',
    shippingFallbackEnabled: true,
    shippingOriginAddress1: '10 Origin St',
    shippingOriginCity: 'Austin',
    shippingOriginPostalCode: '78701',
    shippingOriginCountry: 'US',
    defaultPackageWeightOz: 16,
    defaultPackageLengthIn: 10,
    defaultPackageWidthIn: 8,
    defaultPackageHeightIn: 4,
    shippingDomesticRateCents: 599,
    shippingInternationalRateCents: 1499,
    shippingLocations: [
      {
        id: 'loc_1',
        name: 'HQ',
        address1: '10 Origin St',
        city: 'Austin',
        stateProvince: 'TX',
        postalCode: '78701',
        country: 'US',
        email: null,
        phone: null,
        isDefault: true,
        isActive: true,
      },
    ],
    shippingPackages: [
      {
        id: 'pkg_1',
        name: 'Default Box',
        length: 10,
        width: 8,
        height: 4,
        emptyPackageWeight: 12,
        weightUnit: 'OZ',
        isDefault: true,
        isActive: true,
      },
    ],
    shippingManualRates: [
      {
        id: 'mr_1',
        name: 'Ground',
        rateType: 'FLAT',
        amountCents: 599,
        isActive: true,
      },
    ],
    shippingFallbackRates: [],
    shippingZones: [],
    ...overrides,
  }
}

describe('buildShippingSetupStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: false,
    })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'EASYPOST',
      state: 'CREDENTIALS_SAVED',
      lastVerifiedAt: null,
      lastError: null,
    })
  })

  it('reports canBuyLabels: false when no location is configured', async () => {
    const store = storeFixture({
      shippingLocations: [],
      shippingOriginAddress1: null,
      shippingOriginCity: null,
      shippingOriginPostalCode: null,
      shippingOriginCountry: null,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasOriginAddress).toBe(false)
    expect(status.canBuyLabels).toBe(false)
    expect(status.warnings.some((w) => /origin address/i.test(w))).toBe(true)
  })

  it('reports canBuyLabels: false when no default package is configured', async () => {
    const store = storeFixture({
      shippingPackages: [],
      defaultPackageWeightOz: null,
      defaultPackageLengthIn: null,
      defaultPackageWidthIn: null,
      defaultPackageHeightIn: null,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasDefaultPackage).toBe(false)
    expect(status.canBuyLabels).toBe(false)
  })

  it('reports canBuyLabels: false when provider is not connected', async () => {
    const store = storeFixture({
      shippingLiveProvider: 'EASYPOST',
      shippingProviderUsage: 'LIVE_AND_LABELS',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: false,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasProvider).toBe(true)
    expect(status.providerConnected).toBe(false)
    expect(status.canBuyLabels).toBe(false)
  })

  it('reports canBuyLabels: true when location, package, and provider are all ready', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'EASYPOST',
      shippingProviderUsage: 'LIVE_AND_LABELS',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasOriginAddress).toBe(true)
    expect(status.hasDefaultPackage).toBe(true)
    expect(status.providerConnected).toBe(true)
    expect(status.canBuyLabels).toBe(true)
    expect(status.canUseLiveRates).toBe(true)
  })

  it('reports canUseLiveRates: false in MANUAL mode even when provider is connected', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
      shippingLiveProvider: 'EASYPOST',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.canUseLiveRates).toBe(false)
    // canBuyLabels can still be true in MANUAL mode (labels are independent from checkout mode)
    expect(status.canBuyLabels).toBe(true)
  })

  it('treats LABELS_ONLY usage as label-ready but not live-rate-ready', async () => {
    const store = storeFixture({
      shippingMode: 'HYBRID',
      shippingLiveProvider: 'SHIPPO',
      shippingProviderUsage: 'LABELS_ONLY',
      activeRateProvider: 'NONE',
      labelProvider: 'SHIPPO',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'SHIPPO',
      connected: true,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasProvider).toBe(false)
    expect(status.liveProviderConnected).toBe(false)
    expect(status.labelProviderConnected).toBe(true)
    expect(status.canUseLiveRates).toBe(false)
    expect(status.canBuyLabels).toBe(true)
  })

  it('treats Shippo seller phone as present when store phone fallback exists', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
      activeRateProvider: 'NONE',
      labelProvider: 'SHIPPO',
      shippingLocations: [
        {
          id: 'loc_1',
          name: 'HQ',
          address1: '10 Origin St',
          city: 'Austin',
          stateProvince: 'TX',
          postalCode: '78701',
          country: 'US',
          email: null,
          phone: null,
          isDefault: true,
          isActive: true,
        },
      ],
      supportEmail: null,
      email: 'store@example.com',
      phone: '555-777-9999',
      shippingOriginPhone: null,
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'SHIPPO',
      connected: true,
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.canBuyLabels).toBe(true)
    expect(status.warnings.some((warning) => /phone number/i.test(warning))).toBe(false)
  })

  it('warns when Shippo seller phone is missing across location and store fallbacks', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
      activeRateProvider: 'NONE',
      labelProvider: 'SHIPPO',
      shippingLocations: [
        {
          id: 'loc_1',
          name: 'HQ',
          address1: '10 Origin St',
          city: 'Austin',
          stateProvince: 'TX',
          postalCode: '78701',
          country: 'US',
          email: 'shipping@example.com',
          phone: null,
          isDefault: true,
          isActive: true,
        },
      ],
      phone: null,
      shippingOriginPhone: null,
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'SHIPPO',
      connected: true,
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.canBuyLabels).toBe(false)
    expect(
      status.warnings.some((warning) => /shippo\/usps labels require a ship-from phone number/i.test(warning))
    ).toBe(true)
  })

  it('reports correct nextSteps when provider is selected but not connected', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'SHIPPO',
      activeRateProvider: 'SHIPPO',
      labelProvider: 'SHIPPO',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'SHIPPO',
      connected: false,
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.providerConnected).toBe(false)
    expect(status.warnings.some((w) => /not connected|credentials/i.test(w))).toBe(true)
  })

  it('reports canUseManualRates: true when active manual rates are configured', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
    })

    const status = await buildShippingSetupStatus(store)

    expect(status.hasManualRates).toBe(true)
    expect(status.canUseManualRates).toBe(true)
  })

  it('reports setup as complete when no warnings remain', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
    })

    const status = await buildShippingSetupStatus(store)

    // Manual mode with location, package, and manual rates = no warnings
    expect(status.warnings.filter((w) => !/fallback/i.test(w))).toHaveLength(0)
    expect(status.nextSteps).toContain('Shipping setup looks complete.')
  })

  it('marks provider verification as configured for MANUAL mode with no live provider selected', async () => {
    const store = storeFixture({
      shippingMode: 'MANUAL',
      shippingLiveProvider: null,
      activeRateProvider: 'NONE',
      labelProvider: 'NONE',
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('configured')
  })

  it('marks provider verification as configured when live provider is connected but never verified', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'EASYPOST',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'EASYPOST',
      state: 'CREDENTIALS_SAVED',
      lastVerifiedAt: null,
      lastError: null,
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('configured')
  })

  it('marks provider verification as verified when lastVerifiedAt exists', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'EASYPOST',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'EASYPOST',
      state: 'VERIFIED',
      lastVerifiedAt: '2026-05-15T12:00:00.000Z',
      lastError: null,
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('verified')
    expect(status.providerLastVerifiedAt).toBe('2026-05-15T12:00:00.000Z')
  })

  it('marks provider verification as needs_attention when last verification failed', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'EASYPOST',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'EASYPOST',
      state: 'ERROR',
      lastVerifiedAt: null,
      lastError: 'invalid api key',
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('needs_attention')
    expect(status.providerLastError).toBe('invalid api key')
  })

  it('marks provider verification as needs_setup when live mode has no provider selected', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: null,
      activeRateProvider: 'NONE',
      labelProvider: 'NONE',
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('needs_setup')
  })

  it('marks provider verification as verification_unavailable for unrecognized provider state', async () => {
    const store = storeFixture({
      shippingMode: 'LIVE_RATES',
      shippingLiveProvider: 'EASYPOST',
      activeRateProvider: 'EASYPOST',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: true,
    })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'EASYPOST',
      state: 'UNKNOWN_STATE',
      lastVerifiedAt: null,
      lastError: null,
    })

    const status = await buildShippingSetupStatus(store)
    expect(status.providerVerificationStatus).toBe('verification_unavailable')
  })
})

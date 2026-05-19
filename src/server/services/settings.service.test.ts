import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import {
  getBrandKit,
  getPublicStorefrontSettings,
  getStoreSettings,
  getStoreSettingsFull,
  getStoreSettingsLite,
  updateBrandKit,
} from './settings.service'

function storeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store_1',
    name: 'Doopify Demo',
    email: 'owner@example.com',
    phone: null,
    domain: null,
    currency: 'USD',
    timezone: 'America/New_York',
    logoUrl: 'https://cdn.example.com/logo.png',
    faviconUrl: null,
    emailLogoUrl: null,
    checkoutLogoUrl: null,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    accentColor: null,
    textColor: null,
    headingFont: null,
    bodyFont: null,
    buttonRadius: null,
    buttonStyle: null,
    buttonTextTransform: null,
    emailHeaderColor: null,
    emailFooterText: null,
    supportEmail: null,
    instagramUrl: null,
    facebookUrl: null,
    tiktokUrl: null,
    youtubeUrl: null,
    address1: null,
    address2: null,
    city: null,
    province: null,
    postalCode: null,
    country: null,
    shippingThresholdCents: 10000,
    shippingDomesticRateCents: 999,
    shippingInternationalRateCents: 1999,
    domesticTaxRate: 0.07,
    internationalTaxRate: 0,
    shippingZones: [],
    taxRules: [],
    ...overrides,
  }
}

describe('settings.service brand kit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getBrandKit returns defaults when store is missing', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(null)

    const result = await getBrandKit()

    expect(result).toEqual(
      expect.objectContaining({
        id: null,
        name: 'Doopify',
        primaryColor: '#000000',
        secondaryColor: '#ffffff',
        headingFont: 'system',
        bodyFont: 'system',
        buttonStyle: 'solid',
      })
    )
  })

  it('updateBrandKit saves valid colors, fonts, and button values', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(storeFixture())
    mocks.prisma.store.update.mockResolvedValue(
      storeFixture({
        accentColor: '#3366FF',
        textColor: '#222222',
        headingFont: 'montserrat',
        bodyFont: 'inter',
        buttonRadius: 'lg',
        buttonStyle: 'outline',
        buttonTextTransform: 'uppercase',
      })
    )

    const result = await updateBrandKit({
      accentColor: '#3366FF',
      textColor: '#222222',
      headingFont: 'montserrat',
      bodyFont: 'inter',
      buttonRadius: 'lg',
      buttonStyle: 'outline',
      buttonTextTransform: 'uppercase',
    })

    expect(mocks.prisma.store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store_1' },
        data: expect.objectContaining({
          accentColor: '#3366FF',
          textColor: '#222222',
          headingFont: 'montserrat',
          bodyFont: 'inter',
          buttonRadius: 'lg',
          buttonStyle: 'outline',
          buttonTextTransform: 'uppercase',
        }),
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        accentColor: '#3366FF',
        headingFont: 'montserrat',
        buttonStyle: 'outline',
      })
    )
  })

  it('updateBrandKit rejects invalid hex colors', async () => {
    await expect(
      updateBrandKit({
        primaryColor: 'blue',
      })
    ).rejects.toThrow()

    expect(mocks.prisma.store.update).not.toHaveBeenCalled()
  })

  it('updateBrandKit rejects invalid font values', async () => {
    await expect(
      updateBrandKit({
        headingFont: 'comic-sans',
      })
    ).rejects.toThrow()

    expect(mocks.prisma.store.update).not.toHaveBeenCalled()
  })

  it('updateBrandKit rejects invalid button values', async () => {
    await expect(
      updateBrandKit({
        buttonStyle: 'filled',
      })
    ).rejects.toThrow()

    expect(mocks.prisma.store.update).not.toHaveBeenCalled()
  })

  it('saving brand assets does not clear hidden storefront theme fields', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(storeFixture())
    mocks.prisma.store.update.mockResolvedValue(
      storeFixture({
        name: 'Beta Store',
        supportEmail: 'help@example.com',
        logoUrl: 'https://cdn.example.com/new-logo.png',
        faviconUrl: 'https://cdn.example.com/new-favicon.png',
      })
    )

    await updateBrandKit({
      name: 'Beta Store',
      supportEmail: 'help@example.com',
      logoUrl: 'https://cdn.example.com/new-logo.png',
      faviconUrl: 'https://cdn.example.com/new-favicon.png',
    })

    const updateCall = mocks.prisma.store.update.mock.calls[0]?.[0]
    expect(updateCall.data).toEqual(
      expect.objectContaining({
        name: 'Beta Store',
        supportEmail: 'help@example.com',
        logoUrl: 'https://cdn.example.com/new-logo.png',
        faviconUrl: 'https://cdn.example.com/new-favicon.png',
      })
    )
    expect(updateCall.data).not.toHaveProperty('primaryColor')
    expect(updateCall.data).not.toHaveProperty('secondaryColor')
    expect(updateCall.data).not.toHaveProperty('accentColor')
    expect(updateCall.data).not.toHaveProperty('textColor')
    expect(updateCall.data).not.toHaveProperty('headingFont')
    expect(updateCall.data).not.toHaveProperty('bodyFont')
    expect(updateCall.data).not.toHaveProperty('buttonRadius')
    expect(updateCall.data).not.toHaveProperty('buttonStyle')
    expect(updateCall.data).not.toHaveProperty('buttonTextTransform')
  })

  it('public storefront payload includes safe brand fields only', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(
      storeFixture({
        supportEmail: 'support@example.com',
        accentColor: '#3366FF',
        textColor: '#202020',
        headingFont: 'poppins',
        bodyFont: 'inter',
        buttonStyle: 'soft',
      })
    )

    const result = await getPublicStorefrontSettings()

    expect(result).toEqual(
      expect.objectContaining({
        name: 'Doopify Demo',
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#000000',
        accentColor: '#3366FF',
        textColor: '#202020',
        headingFont: 'poppins',
        bodyFont: 'inter',
        buttonStyle: 'soft',
        supportEmail: 'support@example.com',
      })
    )
    expect(result).not.toHaveProperty('domain')
    expect(result).not.toHaveProperty('shippingZones')
    expect(result).not.toHaveProperty('taxRules')
  })

  it('getStoreSettingsLite fetches store scalars without heavy relation includes', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(storeFixture())

    await getStoreSettingsLite()

    expect(mocks.prisma.store.findFirst).toHaveBeenCalledWith()
  })

  it('getStoreSettingsFull and getStoreSettings keep heavy includes for checkout/shipping consumers', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue(storeFixture())

    await getStoreSettingsFull()
    await getStoreSettings()

    const [fullCall, defaultCall] = mocks.prisma.store.findFirst.mock.calls
    expect(fullCall[0]).toEqual(
      expect.objectContaining({
        include: expect.objectContaining({
          shippingPackages: expect.any(Object),
          shippingLocations: expect.any(Object),
          shippingZones: expect.any(Object),
          taxRules: expect.any(Object),
        }),
      })
    )
    expect(defaultCall[0]).toEqual(
      expect.objectContaining({
        include: expect.objectContaining({
          shippingPackages: expect.any(Object),
          shippingLocations: expect.any(Object),
          shippingZones: expect.any(Object),
          taxRules: expect.any(Object),
        }),
      })
    )
  })
})

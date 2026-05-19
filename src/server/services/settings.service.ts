import { prisma } from '@/lib/prisma'
import { centsToDollars } from '@/lib/money'
import {
  DEFAULT_BRAND_FONT,
  DEFAULT_BUTTON_RADIUS,
  DEFAULT_BUTTON_STYLE,
  DEFAULT_BUTTON_TEXT_TRANSFORM,
  brandKitUpdateSchema,
  normalizeOptionalValue,
} from '@/lib/brand-kit'

type BrandKitRecord = {
  id: string
  name: string
  logoUrl: string | null
  faviconUrl: string | null
  emailLogoUrl: string | null
  checkoutLogoUrl: string | null
  primaryColor: string
  secondaryColor: string
  accentColor: string | null
  textColor: string | null
  headingFont: string | null
  bodyFont: string | null
  buttonRadius: string | null
  buttonStyle: string | null
  buttonTextTransform: string | null
  emailHeaderColor: string | null
  emailFooterText: string | null
  supportEmail: string | null
  email: string | null
  instagramUrl: string | null
  facebookUrl: string | null
  tiktokUrl: string | null
  youtubeUrl: string | null
}

const DEFAULT_PRIMARY_COLOR = '#000000'
const DEFAULT_SECONDARY_COLOR = '#ffffff'
const DEFAULT_ACCENT_COLOR = '#c9a86c'
const DEFAULT_TEXT_COLOR = '#111111'

function mapStoreBrandKit(store: BrandKitRecord | null) {
  if (!store) {
    return {
      id: null,
      name: 'Doopify',
      logoUrl: null,
      faviconUrl: null,
      emailLogoUrl: null,
      checkoutLogoUrl: null,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      accentColor: DEFAULT_ACCENT_COLOR,
      textColor: DEFAULT_TEXT_COLOR,
      headingFont: DEFAULT_BRAND_FONT,
      bodyFont: DEFAULT_BRAND_FONT,
      buttonRadius: DEFAULT_BUTTON_RADIUS,
      buttonStyle: DEFAULT_BUTTON_STYLE,
      buttonTextTransform: DEFAULT_BUTTON_TEXT_TRANSFORM,
      emailHeaderColor: DEFAULT_PRIMARY_COLOR,
      emailFooterText: '',
      supportEmail: null,
      instagramUrl: null,
      facebookUrl: null,
      tiktokUrl: null,
      youtubeUrl: null,
    }
  }

  return {
    id: store.id,
    name: store.name,
    logoUrl: store.logoUrl,
    faviconUrl: store.faviconUrl,
    emailLogoUrl: store.emailLogoUrl,
    checkoutLogoUrl: store.checkoutLogoUrl,
    primaryColor: store.primaryColor || DEFAULT_PRIMARY_COLOR,
    secondaryColor: store.secondaryColor || DEFAULT_SECONDARY_COLOR,
    accentColor: store.accentColor || store.primaryColor || DEFAULT_ACCENT_COLOR,
    textColor: store.textColor || DEFAULT_TEXT_COLOR,
    headingFont: store.headingFont || DEFAULT_BRAND_FONT,
    bodyFont: store.bodyFont || DEFAULT_BRAND_FONT,
    buttonRadius: store.buttonRadius || DEFAULT_BUTTON_RADIUS,
    buttonStyle: store.buttonStyle || DEFAULT_BUTTON_STYLE,
    buttonTextTransform: store.buttonTextTransform || DEFAULT_BUTTON_TEXT_TRANSFORM,
    emailHeaderColor: store.emailHeaderColor || store.primaryColor || DEFAULT_PRIMARY_COLOR,
    emailFooterText: store.emailFooterText || '',
    supportEmail: store.supportEmail || store.email || null,
    instagramUrl: store.instagramUrl,
    facebookUrl: store.facebookUrl,
    tiktokUrl: store.tiktokUrl,
    youtubeUrl: store.youtubeUrl,
  }
}

async function ensureStoreRow() {
  const existing = await prisma.store.findFirst()
  if (existing) return existing

  return prisma.store.create({
    data: {
      name: 'Doopify',
      currency: 'USD',
      timezone: 'America/New_York',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
    },
  })
}

export async function getStoreSettings() {
  return getStoreSettingsFull()
}

export async function getStoreSettingsLite() {
  return prisma.store.findFirst()
}

export async function getStoreSettingsFull() {
  return prisma.store.findFirst({
    include: {
      shippingPackages: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
      shippingLocations: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      },
      shippingManualRates: {
        orderBy: [{ createdAt: 'asc' }],
      },
      shippingFallbackRates: {
        orderBy: [{ createdAt: 'asc' }],
      },
      shippingZones: {
        include: {
          rates: {
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      },
      taxRules: {
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
}

export async function updateStoreSettings(
  storeId: string,
  data: Partial<{
    name: string
    email: string
    phone: string
    domain: string
    currency: string
    timezone: string
    logoUrl: string
    primaryColor: string
    secondaryColor: string
    address1: string
    city: string
    province: string
    postalCode: string
    country: string
    shippingThresholdCents: number
    shippingDomesticRateCents: number
    shippingInternationalRateCents: number
    shippingProviderUsage: 'LIVE_AND_LABELS' | 'LABELS_ONLY' | 'LIVE_RATES_ONLY'
    activeRateProvider: 'NONE' | 'EASYPOST' | 'SHIPPO'
    labelProvider: 'NONE' | 'EASYPOST' | 'SHIPPO'
    fallbackBehavior: 'SHOW_FALLBACK' | 'HIDE_SHIPPING' | 'MANUAL_QUOTE'
    manualFulfillmentInstructions: string | null
    manualTrackingBehavior: string | null
    localDeliveryEnabled: boolean
    localDeliveryPriceCents: number | null
    localDeliveryMinimumOrderCents: number | null
    localDeliveryCoverage: string | null
    localDeliveryInstructions: string | null
    pickupEnabled: boolean
    pickupLocation: string | null
    pickupInstructions: string | null
    pickupEstimate: string | null
    packingSlipUseLogo: boolean
    packingSlipShowSku: boolean
    packingSlipShowProductImages: boolean
    packingSlipFooterNote: string | null
    domesticTaxRate: number
    internationalTaxRate: number
    taxEnabled: boolean
    taxStrategy: 'NONE' | 'MANUAL'
    defaultTaxRateBps: number
    taxShipping: boolean
    pricesIncludeTax: boolean
    taxOriginCountry: string | null
    taxOriginState: string | null
    taxOriginPostalCode: string | null
  }>
) {
  return prisma.store.update({
    where: { id: storeId },
    data,
  })
}

export async function getBrandKit() {
  const store = (await prisma.store.findFirst({
    select: {
      id: true,
      name: true,
      logoUrl: true,
      faviconUrl: true,
      emailLogoUrl: true,
      checkoutLogoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      textColor: true,
      headingFont: true,
      bodyFont: true,
      buttonRadius: true,
      buttonStyle: true,
      buttonTextTransform: true,
      emailHeaderColor: true,
      emailFooterText: true,
      supportEmail: true,
      email: true,
      instagramUrl: true,
      facebookUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
    },
  })) as BrandKitRecord | null

  return mapStoreBrandKit(store)
}

export async function updateBrandKit(input: unknown) {
  const parsed = brandKitUpdateSchema.parse(input)
  const store = await ensureStoreRow()

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.logoUrl !== undefined ? { logoUrl: normalizeOptionalValue(parsed.logoUrl) } : {}),
      ...(parsed.faviconUrl !== undefined ? { faviconUrl: normalizeOptionalValue(parsed.faviconUrl) } : {}),
      ...(parsed.emailLogoUrl !== undefined
        ? { emailLogoUrl: normalizeOptionalValue(parsed.emailLogoUrl) }
        : {}),
      ...(parsed.checkoutLogoUrl !== undefined
        ? { checkoutLogoUrl: normalizeOptionalValue(parsed.checkoutLogoUrl) }
        : {}),
      ...(parsed.primaryColor !== undefined ? { primaryColor: parsed.primaryColor } : {}),
      ...(parsed.secondaryColor !== undefined ? { secondaryColor: parsed.secondaryColor } : {}),
      ...(parsed.accentColor !== undefined ? { accentColor: parsed.accentColor } : {}),
      ...(parsed.textColor !== undefined ? { textColor: parsed.textColor } : {}),
      ...(parsed.headingFont !== undefined ? { headingFont: parsed.headingFont } : {}),
      ...(parsed.bodyFont !== undefined ? { bodyFont: parsed.bodyFont } : {}),
      ...(parsed.buttonRadius !== undefined ? { buttonRadius: parsed.buttonRadius } : {}),
      ...(parsed.buttonStyle !== undefined ? { buttonStyle: parsed.buttonStyle } : {}),
      ...(parsed.buttonTextTransform !== undefined
        ? { buttonTextTransform: parsed.buttonTextTransform }
        : {}),
      ...(parsed.emailHeaderColor !== undefined ? { emailHeaderColor: parsed.emailHeaderColor } : {}),
      ...(parsed.emailFooterText !== undefined
        ? { emailFooterText: normalizeOptionalValue(parsed.emailFooterText) }
        : {}),
      ...(parsed.supportEmail !== undefined ? { supportEmail: normalizeOptionalValue(parsed.supportEmail) } : {}),
      ...(parsed.instagramUrl !== undefined
        ? { instagramUrl: normalizeOptionalValue(parsed.instagramUrl) }
        : {}),
      ...(parsed.facebookUrl !== undefined ? { facebookUrl: normalizeOptionalValue(parsed.facebookUrl) } : {}),
      ...(parsed.tiktokUrl !== undefined ? { tiktokUrl: normalizeOptionalValue(parsed.tiktokUrl) } : {}),
      ...(parsed.youtubeUrl !== undefined ? { youtubeUrl: normalizeOptionalValue(parsed.youtubeUrl) } : {}),
    },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      faviconUrl: true,
      emailLogoUrl: true,
      checkoutLogoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      textColor: true,
      headingFont: true,
      bodyFont: true,
      buttonRadius: true,
      buttonStyle: true,
      buttonTextTransform: true,
      emailHeaderColor: true,
      emailFooterText: true,
      supportEmail: true,
      email: true,
      instagramUrl: true,
      facebookUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
    },
  })

  return mapStoreBrandKit(updated as BrandKitRecord)
}

export async function getPublicStorefrontSettings() {
  const store = await getStoreSettingsLite()
  if (!store) return null

  const brandKit = mapStoreBrandKit(store as BrandKitRecord)

  return {
    name: brandKit.name,
    email: store.email,
    phone: store.phone,
    currency: store.currency,
    logoUrl: brandKit.logoUrl,
    faviconUrl: brandKit.faviconUrl,
    checkoutLogoUrl: brandKit.checkoutLogoUrl,
    primaryColor: brandKit.primaryColor,
    secondaryColor: brandKit.secondaryColor,
    accentColor: brandKit.accentColor,
    textColor: brandKit.textColor,
    headingFont: brandKit.headingFont,
    bodyFont: brandKit.bodyFont,
    buttonRadius: brandKit.buttonRadius,
    buttonStyle: brandKit.buttonStyle,
    buttonTextTransform: brandKit.buttonTextTransform,
    supportEmail: brandKit.supportEmail,
    address1: store.address1,
    address2: store.address2,
    city: store.city,
    province: store.province,
    postalCode: store.postalCode,
    country: store.country,
    instagramUrl: brandKit.instagramUrl,
    facebookUrl: brandKit.facebookUrl,
    tiktokUrl: brandKit.tiktokUrl,
    youtubeUrl: brandKit.youtubeUrl,
    shippingThreshold: store.shippingThresholdCents == null ? null : centsToDollars(store.shippingThresholdCents),
    shippingDomesticRate: centsToDollars(store.shippingDomesticRateCents),
    shippingInternationalRate: centsToDollars(store.shippingInternationalRateCents),
    domesticTaxRate: store.domesticTaxRate,
    internationalTaxRate: store.internationalTaxRate,
    taxEnabled: store.taxEnabled,
    taxStrategy: store.taxStrategy,
    defaultTaxRateBps: store.defaultTaxRateBps,
    taxShipping: store.taxShipping,
    pricesIncludeTax: store.pricesIncludeTax,
    taxOriginCountry: store.taxOriginCountry,
    taxOriginState: store.taxOriginState,
    taxOriginPostalCode: store.taxOriginPostalCode,
  }
}

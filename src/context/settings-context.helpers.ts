import {
  normalizeStoreCurrency,
  normalizeStoreTimeZone,
} from '@/lib/store-settings-options'

export const SETTINGS_DEFAULTS = {
  storeName: 'Doopify Store',
  supportEmail: 'support@doopify.com',
  phone: '',
  address: '',
  timezone: 'America/New_York',
  currency: 'USD',
  logoUrl: '',
  brandPrimary: '#004fc4',
  brandAccent: '#60a5fa',
  orderPrefix: 'DPY',
  defaultLocation: 'Main warehouse',
  shippingOrigin: 'Main warehouse',
  freeShippingThreshold: '100',
  domesticShippingRate: '9.99',
  internationalShippingRate: '19.99',
  domesticTaxRate: '7',
  internationalTaxRate: '0',
  taxEnabled: false,
  taxStrategy: 'NONE',
  defaultTaxRatePercent: '0',
  taxShipping: false,
  pricesIncludeTax: false,
  taxOriginCountry: '',
  taxOriginState: '',
  taxOriginPostalCode: '',
  senderEmail: 'hello@doopify.com',
  lowInventoryAlert: '5',
} as const

export function parseNumberField(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function requireSettingsApiData(responseOk: boolean, payload: unknown) {
  const response = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const data = response?.data

  if (!responseOk || response?.success !== true || !data || typeof data !== 'object') {
    const message = typeof response?.error === 'string' ? response.error : 'Failed to save settings'
    throw new Error(message)
  }

  return data as Record<string, unknown>
}

export function transformStore(
  store: Record<string, unknown>,
  defaults: typeof SETTINGS_DEFAULTS = SETTINGS_DEFAULTS
) {
  const address = [store.address1, store.city, store.province, store.country]
    .filter(Boolean)
    .join(', ')

  return {
    storeName: String(store.name || defaults.storeName),
    supportEmail: String(store.email || defaults.supportEmail),
    phone: String(store.phone || ''),
    address,
    timezone: normalizeStoreTimeZone(store.timezone, defaults.timezone),
    currency: normalizeStoreCurrency(store.currency, 'USD'),
    logoUrl: String(store.logoUrl || ''),
    brandPrimary: String(store.primaryColor || defaults.brandPrimary),
    brandAccent: String(store.secondaryColor || defaults.brandAccent),
    orderPrefix: 'DPY',
    defaultLocation: String(store.city || defaults.defaultLocation),
    shippingOrigin: String(store.city || defaults.shippingOrigin),
    freeShippingThreshold:
      store.shippingThreshold != null ? String(store.shippingThreshold) : defaults.freeShippingThreshold,
    domesticShippingRate:
      store.shippingDomesticRate != null ? String(store.shippingDomesticRate) : defaults.domesticShippingRate,
    internationalShippingRate:
      store.shippingInternationalRate != null
        ? String(store.shippingInternationalRate)
        : defaults.internationalShippingRate,
    domesticTaxRate:
      store.domesticTaxRate != null
        ? String(Number(store.domesticTaxRate) * 100)
        : defaults.domesticTaxRate,
    internationalTaxRate:
      store.internationalTaxRate != null
        ? String(Number(store.internationalTaxRate) * 100)
        : defaults.internationalTaxRate,
    taxEnabled: Boolean(store.taxEnabled),
    taxStrategy: String(store.taxStrategy || defaults.taxStrategy),
    defaultTaxRatePercent:
      store.defaultTaxRatePercent != null
        ? String(Number(store.defaultTaxRatePercent))
        : defaults.defaultTaxRatePercent,
    taxShipping: Boolean(store.taxShipping),
    pricesIncludeTax: Boolean(store.pricesIncludeTax),
    taxOriginCountry: String(store.taxOriginCountry || ''),
    taxOriginState: String(store.taxOriginState || ''),
    taxOriginPostalCode: String(store.taxOriginPostalCode || ''),
    senderEmail: String(store.email || defaults.senderEmail),
    lowInventoryAlert: '5',
    _storeId: store.id,
  }
}

export function buildSettingsPatchPayload(patch: Record<string, unknown>) {
  return {
    name: patch.storeName,
    email: patch.supportEmail,
    phone: patch.phone,
    timezone: patch.timezone,
    currency: patch.currency,
    logoUrl: patch.logoUrl,
    primaryColor: patch.brandPrimary,
    secondaryColor: patch.brandAccent,
    shippingThreshold: parseNumberField(patch.freeShippingThreshold),
    shippingDomesticRate: parseNumberField(patch.domesticShippingRate),
    shippingInternationalRate: parseNumberField(patch.internationalShippingRate),
    domesticTaxRate:
      patch.domesticTaxRate != null && patch.domesticTaxRate !== ''
        ? Number(patch.domesticTaxRate) / 100
        : undefined,
    internationalTaxRate:
      patch.internationalTaxRate != null && patch.internationalTaxRate !== ''
        ? Number(patch.internationalTaxRate) / 100
        : undefined,
    taxEnabled: patch.taxEnabled,
    taxStrategy: patch.taxStrategy,
    defaultTaxRatePercent:
      patch.defaultTaxRatePercent != null && patch.defaultTaxRatePercent !== ''
        ? Number(patch.defaultTaxRatePercent)
        : undefined,
    taxShipping: patch.taxShipping,
    pricesIncludeTax: patch.pricesIncludeTax,
    taxOriginCountry:
      patch.taxOriginCountry !== undefined
        ? patch.taxOriginCountry || null
        : undefined,
    taxOriginState:
      patch.taxOriginState !== undefined
        ? patch.taxOriginState || null
        : undefined,
    taxOriginPostalCode:
      patch.taxOriginPostalCode !== undefined
        ? patch.taxOriginPostalCode || null
        : undefined,
  }
}

import type { ShippingLiveProvider, ShippingMode, ShippingWeightUnit } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { findPrimaryStore } from '@/server/services/primary-store.service'
import {
  getShippingProviderApiKey,
  getShippingProviderConnectionStatus,
  getShippingProviderLiveRates,
} from '@/server/shipping/shipping-provider.service'
import { resolveActiveRateProvider } from '@/server/shipping/shipping-provider-selection'
import type {
  ShippingRateAddress,
  ShippingRateParcel,
  ShippingRateQuote,
  ShippingRateRequest,
} from '@/server/shipping/shipping-rate.types'

type ShippingRateStore = Awaited<ReturnType<typeof getShippingRateStore>>

export class ShippingRateSetupError extends Error {
  code: 'SETUP_REQUIRED' | 'PROVIDER_ERROR'

  constructor(message: string, code: 'SETUP_REQUIRED' | 'PROVIDER_ERROR' = 'SETUP_REQUIRED') {
    super(message)
    this.name = 'ShippingRateSetupError'
    this.code = code
  }
}

export type GetShippingRatesForCheckoutInput = {
  storeId?: string
  subtotalCents: number
  totalWeightOz?: number
  shippingAddress: ShippingRateAddress
}

const FALLBACK_PRIORITY = 10_000

function allowLegacyShippingFallbacks() {
  return process.env.NODE_ENV !== 'production' || process.env.CHECKOUT_ALLOW_DEV_FALLBACKS === 'true'
}

function normalizeCountry(value?: string | null) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()

  if (!normalized) return ''
  if (normalized === 'USA' || normalized === 'UNITED STATES' || normalized === 'UNITED STATES OF AMERICA') {
    return 'US'
  }
  return normalized
}

function normalizeProvince(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

function normalizeOptionalEmail(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeAddress(value: ShippingRateAddress) {
  return {
    name: value.name?.trim() || null,
    phone: value.phone?.trim() || null,
    email: value.email?.trim() || null,
    address1: value.address1?.trim() || null,
    address2: value.address2?.trim() || null,
    city: value.city?.trim() || null,
    province: value.province?.trim() || null,
    postalCode: value.postalCode?.trim() || null,
    country: normalizeCountry(value.country),
  } satisfies ShippingRateAddress
}

function ensureValidSubtotalCents(subtotalCents: number) {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error('subtotalCents must be a non-negative integer')
  }
}

async function getShippingRateStore(storeId?: string) {
  const query = {
    include: {
      shippingPackages: {
        orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
      },
      shippingLocations: {
        orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
      },
      shippingManualRates: {
        orderBy: [{ createdAt: 'asc' as const }],
      },
      shippingFallbackRates: {
        orderBy: [{ createdAt: 'asc' as const }],
      },
      shippingZones: {
        include: {
          rates: true,
        },
      },
    },
  }

  if (storeId) {
    return prisma.store.findUnique({
      where: { id: storeId },
      ...query,
    })
  }

  return findPrimaryStore(query)
}

function hasAddressForLiveRateQuotes(address: ShippingRateAddress) {
  return Boolean(address.address1 && address.city && address.postalCode && address.country)
}

function convertToOz(weight: number, unit: ShippingWeightUnit) {
  if (!Number.isFinite(weight) || weight <= 0) return 0

  switch (unit) {
    case 'LB':
      return weight * 16
    case 'G':
      return weight * 0.0352739619
    case 'KG':
      return weight * 35.2739619
    default:
      return weight
  }
}

function convertToInches(length: number, unit: 'IN' | 'CM') {
  if (!Number.isFinite(length) || length <= 0) return 0
  return unit === 'CM' ? length * 0.3937007874 : length
}

function resolveDefaultLocation(store: NonNullable<ShippingRateStore>) {
  const locations = store.shippingLocations || []
  const persistedDefault = locations.find((location) => location.isDefault && location.isActive)
  if (persistedDefault) return persistedDefault
  return locations.find((location) => location.isActive) || null
}

function resolveDefaultPackage(store: NonNullable<ShippingRateStore>) {
  const shippingPackages = store.shippingPackages || []
  const persistedDefault = shippingPackages.find((entry) => entry.isDefault && entry.isActive)
  if (persistedDefault) return persistedDefault
  return shippingPackages.find((entry) => entry.isActive) || null
}

function hasOriginForLiveRateQuotes(store: NonNullable<ShippingRateStore>) {
  const location = resolveDefaultLocation(store)
  if (location) {
    return Boolean(location.address1 && location.city && location.postalCode && location.country)
  }

  return Boolean(
    store.shippingOriginAddress1 &&
      store.shippingOriginCity &&
      store.shippingOriginPostalCode &&
      store.shippingOriginCountry
  )
}

function hasDefaultPackageForLiveRates(store: NonNullable<ShippingRateStore>) {
  const shippingPackage = resolveDefaultPackage(store)
  if (shippingPackage) {
    return Boolean(
      Number(shippingPackage.emptyPackageWeight ?? 0) > 0 &&
        Number(shippingPackage.length ?? 0) > 0 &&
        Number(shippingPackage.width ?? 0) > 0 &&
        Number(shippingPackage.height ?? 0) > 0
    )
  }

  return Boolean(
    Number(store.defaultPackageWeightOz ?? 0) > 0 &&
      Number(store.defaultPackageLengthIn ?? 0) > 0 &&
      Number(store.defaultPackageWidthIn ?? 0) > 0 &&
      Number(store.defaultPackageHeightIn ?? 0) > 0
  )
}

function buildRateRequestFromStore(input: {
  store: NonNullable<ShippingRateStore>
  shippingAddress: ShippingRateAddress
}): ShippingRateRequest {
  const { store } = input
  const destinationAddress = normalizeAddress(input.shippingAddress)

  if (!hasAddressForLiveRateQuotes(destinationAddress)) {
    throw new ShippingRateSetupError(
      'Destination shipping address is incomplete for live shipping rates. Include address line, city, postal code, and country.'
    )
  }

  if (!hasOriginForLiveRateQuotes(store)) {
    throw new ShippingRateSetupError(
      'Ship-from location is incomplete. Add a default active location before requesting live rates.'
    )
  }

  if (!hasDefaultPackageForLiveRates(store)) {
    throw new ShippingRateSetupError(
      'Default package is incomplete. Add a default active package before requesting live rates.'
    )
  }

  const location = resolveDefaultLocation(store)
  const shippingPackage = resolveDefaultPackage(store)

  return {
    apiKey: '',
    currency: (store.currency || 'USD').toUpperCase(),
    originAddress: {
      name: location?.contactName || location?.name || store.shippingOriginName,
      phone: location?.phone || store.shippingOriginPhone,
      email:
        normalizeOptionalEmail(location?.email) ||
        normalizeOptionalEmail(store.supportEmail) ||
        normalizeOptionalEmail(store.email),
      address1: location?.address1 || store.shippingOriginAddress1,
      address2: location?.address2 || store.shippingOriginAddress2,
      city: location?.city || store.shippingOriginCity,
      province: location?.stateProvince || store.shippingOriginProvince,
      postalCode: location?.postalCode || store.shippingOriginPostalCode,
      country: location?.country || store.shippingOriginCountry,
    },
    destinationAddress,
    parcel: {
      weightOz: shippingPackage
        ? convertToOz(shippingPackage.emptyPackageWeight, shippingPackage.weightUnit)
        : Number(store.defaultPackageWeightOz),
      lengthIn: shippingPackage
        ? convertToInches(shippingPackage.length, shippingPackage.dimensionUnit)
        : Number(store.defaultPackageLengthIn),
      widthIn: shippingPackage
        ? convertToInches(shippingPackage.width, shippingPackage.dimensionUnit)
        : Number(store.defaultPackageWidthIn),
      heightIn: shippingPackage
        ? convertToInches(shippingPackage.height, shippingPackage.dimensionUnit)
        : Number(store.defaultPackageHeightIn),
    },
  }
}

function getMode(store: NonNullable<ShippingRateStore>): ShippingMode {
  return store.shippingMode ?? 'MANUAL'
}

function getProvider(store: NonNullable<ShippingRateStore>): ShippingLiveProvider | null {
  return resolveActiveRateProvider(store)
}

function getFallbackBehavior(store: NonNullable<ShippingRateStore>) {
  if (store.fallbackBehavior) {
    return store.fallbackBehavior
  }

  if (store.shippingFallbackEnabled === false) {
    return 'HIDE_SHIPPING' as const
  }

  return 'SHOW_FALLBACK' as const
}

function filterByRegion(input: {
  destinationCountry: string
  destinationProvince: string
  regionCountry?: string | null
  regionStateProvince?: string | null
}) {
  const regionCountry = normalizeCountry(input.regionCountry)
  if (regionCountry && regionCountry !== input.destinationCountry) {
    return false
  }

  const regionProvince = normalizeProvince(input.regionStateProvince)
  if (regionProvince && regionProvince !== input.destinationProvince) {
    return false
  }

  return true
}

function resolveModernManualQuotes(input: {
  store: NonNullable<ShippingRateStore>
  subtotalCents: number
  totalWeightOz: number
  shippingAddress: ShippingRateAddress
}): ShippingRateQuote[] {
  const destinationCountry = normalizeCountry(input.shippingAddress.country)
  const destinationProvince = normalizeProvince(input.shippingAddress.province)
  const currency = (input.store.currency || 'USD').toUpperCase()

  const eligible = (input.store.shippingManualRates || [])
    .filter((rate) => rate.isActive)
    .filter((rate) =>
      filterByRegion({
        destinationCountry,
        destinationProvince,
        regionCountry: rate.regionCountry,
        regionStateProvince: rate.regionStateProvince,
      })
    )
    .filter((rate) => {
      if (rate.rateType === 'PRICE_BASED') {
        const minSubtotalCents = rate.minSubtotalCents ?? 0
        // Treat 0 as no maximum — saving 0 is almost always a misconfiguration.
        const maxSubtotalCents =
          rate.maxSubtotalCents == null || rate.maxSubtotalCents === 0
            ? Number.POSITIVE_INFINITY
            : rate.maxSubtotalCents
        return input.subtotalCents >= minSubtotalCents && input.subtotalCents <= maxSubtotalCents
      }

      if (rate.rateType === 'WEIGHT_BASED') {
        const minWeight = rate.minWeight ?? 0
        const maxWeight = rate.maxWeight ?? Number.POSITIVE_INFINITY
        return input.totalWeightOz >= minWeight && input.totalWeightOz <= maxWeight
      }

      if (rate.rateType === 'FREE' && rate.freeOverAmountCents != null) {
        return input.subtotalCents >= rate.freeOverAmountCents
      }

      return true
    })

  return eligible.map((rate) => {
    const amountCents = rate.rateType === 'FREE' ? 0 : rate.amountCents
    return {
      id: `manual-rate:${rate.id}`,
      source: 'MANUAL',
      rateType: rate.rateType,
      displayName: rate.name,
      amountCents,
      currency,
      estimatedDeliveryText: rate.estimatedDeliveryText ?? undefined,
      metadata: {
        manualRateId: rate.id,
        regionCountry: rate.regionCountry,
        regionStateProvince: rate.regionStateProvince,
      },
    } satisfies ShippingRateQuote
  })
}

function resolveLegacyManualQuotes(input: {
  store: NonNullable<ShippingRateStore>
  subtotalCents: number
  shippingAddress: ShippingRateAddress
}): ShippingRateQuote[] {
  const { store, subtotalCents } = input
  const destinationCountry = normalizeCountry(input.shippingAddress.country)
  const destinationProvince = normalizeProvince(input.shippingAddress.province)
  const currency = (store.currency || 'USD').toUpperCase()

  if (subtotalCents <= 0) {
    return [
      {
        id: 'manual:none',
        source: 'MANUAL',
        displayName: 'No shipping charge',
        amountCents: 0,
        currency,
      },
    ]
  }

  if (store.shippingThresholdCents != null && subtotalCents >= store.shippingThresholdCents) {
    return [
      {
        id: 'manual:threshold',
        source: 'MANUAL',
        rateType: 'FREE',
        displayName: 'Free shipping threshold',
        amountCents: 0,
        currency,
        metadata: {
          thresholdCents: store.shippingThresholdCents,
        },
      },
    ]
  }

  const matchingZone = store.shippingZones
    .filter((zone) => zone.isActive)
    .filter((zone) => normalizeCountry(zone.countryCode) === destinationCountry)
    .filter((zone) => {
      const zoneProvince = normalizeProvince(zone.provinceCode)
      return !zoneProvince || zoneProvince === destinationProvince
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority
      const leftSpecificity = left.provinceCode ? 1 : 0
      const rightSpecificity = right.provinceCode ? 1 : 0
      if (leftSpecificity !== rightSpecificity) return rightSpecificity - leftSpecificity
      return left.name.localeCompare(right.name)
    })[0]

  if (matchingZone) {
    const quotes = matchingZone.rates
      .filter((rate) => rate.isActive)
      .filter((rate) => {
        if (rate.method !== 'SUBTOTAL_TIER') return true
        const minSubtotalCents = rate.minSubtotalCents ?? 0
        const maxSubtotalCents = rate.maxSubtotalCents ?? Number.POSITIVE_INFINITY
        return subtotalCents >= minSubtotalCents && subtotalCents <= maxSubtotalCents
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority
        const leftTierMin = left.method === 'SUBTOTAL_TIER' ? left.minSubtotalCents ?? 0 : -1
        const rightTierMin = right.method === 'SUBTOTAL_TIER' ? right.minSubtotalCents ?? 0 : -1
        return rightTierMin - leftTierMin
      })
      .map((rate) => ({
        id: `manual:${matchingZone.id}:${rate.id}`,
        source: 'MANUAL' as const,
        rateType: rate.method === 'SUBTOTAL_TIER' ? 'PRICE_BASED' as const : 'FLAT' as const,
        displayName: `${matchingZone.name} - ${rate.name}`,
        amountCents: rate.amountCents,
        currency,
        metadata: {
          zoneId: matchingZone.id,
          zoneName: matchingZone.name,
          rateId: rate.id,
          rateMethod: rate.method,
        },
      }))

    if (quotes.length) return quotes
  }

  if (!allowLegacyShippingFallbacks()) {
    return []
  }

  const originCountry = normalizeCountry(store.country)
  const isInternational = Boolean(destinationCountry && originCountry && destinationCountry !== originCountry)
  const amountCents = isInternational ? store.shippingInternationalRateCents : store.shippingDomesticRateCents

  return [
    {
      id: `manual:fallback:${isInternational ? 'international' : 'domestic'}`,
      source: 'MANUAL',
      rateType: 'FLAT',
      displayName: isInternational ? 'International shipping' : 'Domestic shipping',
      amountCents,
      currency,
      metadata: {
        fallback: true,
        priority: FALLBACK_PRIORITY,
        devOnly: true,
      },
    },
  ]
}

function resolveManualQuotes(input: {
  store: NonNullable<ShippingRateStore>
  subtotalCents: number
  totalWeightOz: number
  shippingAddress: ShippingRateAddress
}): ShippingRateQuote[] {
  const modernQuotes = resolveModernManualQuotes(input)
  if (modernQuotes.length) {
    return modernQuotes
  }

  return resolveLegacyManualQuotes(input)
}

function resolveFallbackQuotes(input: {
  store: NonNullable<ShippingRateStore>
  shippingAddress: ShippingRateAddress
}): ShippingRateQuote[] {
  const destinationCountry = normalizeCountry(input.shippingAddress.country)
  const destinationProvince = normalizeProvince(input.shippingAddress.province)
  const currency = (input.store.currency || 'USD').toUpperCase()

  const eligibleFallbackRates = (input.store.shippingFallbackRates || [])
    .filter((rate) => rate.isActive)
    .filter((rate) =>
      filterByRegion({
        destinationCountry,
        destinationProvince,
        regionCountry: rate.regionCountry,
        regionStateProvince: rate.regionStateProvince,
      })
    )

  if (eligibleFallbackRates.length) {
    return eligibleFallbackRates.map((rate) => ({
      id: `fallback:${rate.id}`,
      source: 'MANUAL',
      rateType: 'FALLBACK',
      displayName: rate.name,
      amountCents: rate.amountCents,
      currency,
      estimatedDeliveryText: rate.estimatedDeliveryText ?? undefined,
      metadata: {
        fallbackRateId: rate.id,
      },
    }))
  }

  return []
}

function buildManualQuoteFallback(store: NonNullable<ShippingRateStore>): ShippingRateQuote {
  return {
    id: 'fallback:manual-quote',
    source: 'MANUAL',
    rateType: 'FALLBACK',
    displayName: 'Shipping quoted after checkout',
    amountCents: 0,
    currency: (store.currency || 'USD').toUpperCase(),
    estimatedDeliveryText: 'We will confirm shipping cost after order review.',
    metadata: {
      fallbackMode: 'MANUAL_QUOTE',
    },
  }
}

async function resolveLiveQuotes(input: {
  store: NonNullable<ShippingRateStore>
  provider: ShippingLiveProvider
  shippingAddress: ShippingRateAddress
  totalWeightOz: number
}): Promise<ShippingRateQuote[]> {
  const apiKey = await getShippingProviderApiKey(input.provider)
  if (!apiKey) {
    throw new ShippingRateSetupError(
      `Live rates require ${input.provider} credentials. Connect provider credentials in settings or configure ${input.provider}_API_KEY in env.`
    )
  }

  const connectionStatus = await getShippingProviderConnectionStatus(input.provider)
  const isUsingEnvFallback = !connectionStatus.connected

  if (isUsingEnvFallback && process.env.NODE_ENV === 'production') {
    throw new ShippingRateSetupError(
      `Live rates provider ${input.provider} is not connected in Settings. Configure and verify provider credentials before using production live rates.`
    )
  }

  const rateRequest = buildRateRequestFromStore({
    store: input.store,
    shippingAddress: input.shippingAddress,
  })
  if (input.provider === 'SHIPPO' && !rateRequest.originAddress.email) {
    throw new ShippingRateSetupError(
      'Ship-from email is required for Shippo live rates. Add an email to your shipping location or store profile.'
    )
  }

  const quotes = await getShippingProviderLiveRates({
    provider: input.provider,
    request: {
      ...rateRequest,
      apiKey,
    },
  })

  if (!quotes.length) {
    const weightHint =
      input.totalWeightOz <= 0
        ? ' Product weights may be missing. Add weight to product variants and try again.'
        : ''
    throw new ShippingRateSetupError(
      `${input.provider} returned no live rates for this shipment.${weightHint}`,
      'PROVIDER_ERROR'
    )
  }

  return quotes.map((quote) => ({
    ...quote,
    rateType: quote.rateType ?? 'LIVE_RATE',
  }))
}

function diagnoseModernManualRateMismatch(input: {
  store: NonNullable<ShippingRateStore>
  subtotalCents: number
  totalWeightOz: number
  shippingAddress: ShippingRateAddress
}): string | null {
  const allModernRates = input.store.shippingManualRates || []
  if (!allModernRates.length) return null

  const activeRates = allModernRates.filter((r) => r.isActive)
  if (!activeRates.length) {
    return 'No active manual shipping rates are configured. Add a manual rate in Settings → Shipping & delivery.'
  }

  const destinationCountry = normalizeCountry(input.shippingAddress.country)
  const destinationProvince = normalizeProvince(input.shippingAddress.province)

  const regionMatches = activeRates.filter((r) =>
    filterByRegion({
      destinationCountry,
      destinationProvince,
      regionCountry: r.regionCountry,
      regionStateProvince: r.regionStateProvince,
    })
  )

  if (!regionMatches.length) {
    const countryLabel = destinationCountry || 'this country'
    return `No shipping rate is configured for ${countryLabel}. Add a rate with destination country "${countryLabel}" or leave it blank to match all countries.`
  }

  const hasWeightBased = regionMatches.some((r) => r.rateType === 'WEIGHT_BASED')
  if (hasWeightBased && input.totalWeightOz === 0) {
    return 'No shipping rate matched. Weight-based rates require product weights. Add weight to each product variant, or set the rate minimum weight to 0 to match any cart.'
  }

  return 'No shipping rate matched this destination. Check that rate conditions (weight range, order total) are correct for this cart.'
}

export async function getShippingRatesForCheckout(input: GetShippingRatesForCheckoutInput): Promise<ShippingRateQuote[]> {
  ensureValidSubtotalCents(input.subtotalCents)

  const store = await getShippingRateStore(input.storeId)
  if (!store) {
    throw new ShippingRateSetupError('Store not configured for shipping.')
  }

  const mode = getMode(store)
  const provider = getProvider(store)
  const fallbackBehavior = getFallbackBehavior(store)
  const totalWeightOz = Number(input.totalWeightOz ?? 0)
  const manualQuotes = () =>
    resolveManualQuotes({
      store,
      subtotalCents: input.subtotalCents,
      totalWeightOz,
      shippingAddress: input.shippingAddress,
    })
  const fallbackQuotes = () =>
    resolveFallbackQuotes({
      store,
      shippingAddress: input.shippingAddress,
    })

  if (mode === 'MANUAL') {
    const manual = manualQuotes()
    if (manual.length) return manual
    const specificReason = diagnoseModernManualRateMismatch({
      store,
      subtotalCents: input.subtotalCents,
      totalWeightOz,
      shippingAddress: input.shippingAddress,
    })
    throw new ShippingRateSetupError(
      specificReason ??
        'No shipping rate available for this destination. Configure manual rates in Settings → Shipping & delivery.'
    )
  }

  if (!provider) {
    const legacyLiveProviderConfigured = Boolean(store.shippingLiveProvider)
    if (
      legacyLiveProviderConfigured &&
      (store.shippingProviderUsage ?? 'LIVE_AND_LABELS') === 'LABELS_ONLY' &&
      (mode === 'LIVE_RATES' || mode === 'HYBRID')
    ) {
      throw new ShippingRateSetupError(
        'Provider is configured for labels only. Enable live-rate usage to quote checkout rates.'
      )
    }

    if (mode === 'HYBRID') {
      const manual = manualQuotes()
      if (manual.length) return manual
      throw new ShippingRateSetupError('Hybrid shipping mode requires manual rates when no provider is selected.')
    }

    throw new ShippingRateSetupError(
      'Live shipping mode is enabled, but no live-rate provider is selected. Go to Settings -> Shipping & delivery -> Live rates provider and choose Shippo or EasyPost.'
    )
  }

  const providerUsage = store.shippingProviderUsage ?? 'LIVE_AND_LABELS'
  if (providerUsage === 'LABELS_ONLY') {
    if (mode === 'HYBRID') {
      const manual = manualQuotes()
      if (manual.length) return manual
      throw new ShippingRateSetupError('Provider is configured for labels only. Add manual rates for hybrid checkout.')
    }

    throw new ShippingRateSetupError('Provider is configured for labels only. Enable live-rate usage to quote checkout rates.')
  }

  if (mode === 'LIVE_RATES') {
    try {
      return await resolveLiveQuotes({
        store,
        provider,
        shippingAddress: input.shippingAddress,
        totalWeightOz,
      })
    } catch (error) {
      if (fallbackBehavior !== 'HIDE_SHIPPING') {
        const fallback = fallbackQuotes()
        if (fallback.length) {
          return fallback
        }
      }

      if (fallbackBehavior === 'MANUAL_QUOTE') {
        return [buildManualQuoteFallback(store)]
      }
      throw error
    }
  }

  // HYBRID mode: prefer live rates; only use manual/fallback rates when live rates are unavailable.
  const manual = manualQuotes()
  try {
    return await resolveLiveQuotes({
      store,
      provider,
      shippingAddress: input.shippingAddress,
      totalWeightOz,
    })
  } catch (liveError) {
    if (fallbackBehavior !== 'HIDE_SHIPPING') {
      const fallback = fallbackQuotes()
      if (fallback.length) {
        return fallback
      }

      if (manual.length) {
        return manual
      }
    }

    if (fallbackBehavior === 'MANUAL_QUOTE') {
      return [buildManualQuoteFallback(store)]
    }

    if (liveError instanceof ShippingRateSetupError) {
      throw liveError
    }
    throw new ShippingRateSetupError('Live rates are unavailable and no fallback/manual rates are configured.')
  }
}

export function buildDefaultShippingAddressForRates(input: {
  country: string
  province?: string | null
}): ShippingRateAddress {
  return {
    name: 'Rate Test Customer',
    address1: '1 Test St',
    city: 'Test City',
    postalCode: '00000',
    country: input.country,
    province: input.province ?? null,
  }
}

export function buildDefaultParcelFromStore(store: NonNullable<ShippingRateStore>): ShippingRateParcel | null {
  const shippingPackage = resolveDefaultPackage(store)
  if (shippingPackage) {
    return {
      weightOz: convertToOz(shippingPackage.emptyPackageWeight, shippingPackage.weightUnit),
      lengthIn: convertToInches(shippingPackage.length, shippingPackage.dimensionUnit),
      widthIn: convertToInches(shippingPackage.width, shippingPackage.dimensionUnit),
      heightIn: convertToInches(shippingPackage.height, shippingPackage.dimensionUnit),
    }
  }

  if (!hasDefaultPackageForLiveRates(store)) return null

  return {
    weightOz: Number(store.defaultPackageWeightOz),
    lengthIn: Number(store.defaultPackageLengthIn),
    widthIn: Number(store.defaultPackageWidthIn),
    heightIn: Number(store.defaultPackageHeightIn),
  }
}

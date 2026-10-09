import { type ShippingLiveProvider } from '@prisma/client'

export { getShippingSettingsStore as getShippingSetupStore } from './shipping-settings.service'
import { getShippingProviderConnectionStatus } from '@/server/shipping/shipping-provider.service'
import {
  resolveActiveRateProvider,
  resolveLabelProvider,
} from '@/server/shipping/shipping-provider-selection'

export type ShippingSetupStatus = {
  shippingMode: 'MANUAL' | 'LIVE_RATES' | 'HYBRID'
  activeRateProvider: ShippingLiveProvider | null
  labelProvider: ShippingLiveProvider | null
  mode: 'MANUAL' | 'LIVE_RATES' | 'HYBRID'
  hasOriginAddress: boolean
  hasDefaultPackage: boolean
  hasManualRates: boolean
  hasFallbackRate: boolean
  hasProvider: boolean
  providerConnected: boolean
  liveProviderConnected: boolean
  labelProviderConnected: boolean
  shippingProviderConnections: Record<
    ShippingLiveProvider,
    {
      connected: boolean
      hasCredentials: boolean
      selectedForLiveRates: boolean
      selectedForLabels: boolean
    }
  >
  canUseManualRates: boolean
  canUseLiveRates: boolean
  canBuyLabels: boolean
  warnings: string[]
  nextSteps: string[]
}

function normalizeOptionalText(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function resolveOptionalStoreField(store: any, field: string) {
  const value = store?.[field]
  return typeof value === 'string' ? value : null
}

function resolveShipFromEmail(store: any) {
  const defaultLocation = (store.shippingLocations || []).find((location: any) => location.isDefault) || null
  return (
    normalizeOptionalText(defaultLocation?.email) ||
    normalizeOptionalText(store.supportEmail) ||
    normalizeOptionalText(store.email) ||
    normalizeOptionalText(resolveOptionalStoreField(store, 'shippingOriginEmail'))
  )
}

function resolveShipFromPhone(store: any) {
  const defaultLocation = (store.shippingLocations || []).find((location: any) => location.isDefault) || null
  return (
    normalizeOptionalText(defaultLocation?.phone) ||
    normalizeOptionalText(resolveOptionalStoreField(store, 'supportPhone')) ||
    normalizeOptionalText(store.phone) ||
    normalizeOptionalText(store.shippingOriginPhone)
  )
}

function hasOriginAddress(store: any) {
  const defaultLocation = (store.shippingLocations || []).find((location: any) => location.isDefault) || null
  if (defaultLocation) {
    return Boolean(
      normalizeOptionalText(defaultLocation.address1) &&
        normalizeOptionalText(defaultLocation.city) &&
        normalizeOptionalText(defaultLocation.postalCode) &&
        normalizeOptionalText(defaultLocation.country)
    )
  }

  return Boolean(
    normalizeOptionalText(store.shippingOriginAddress1) &&
      normalizeOptionalText(store.shippingOriginCity) &&
      normalizeOptionalText(store.shippingOriginPostalCode) &&
      normalizeOptionalText(store.shippingOriginCountry)
  )
}

function hasDefaultPackage(store: any) {
  const defaultPackage = (store.shippingPackages || []).find((entry: any) => entry.isDefault) || null
  if (defaultPackage) {
    return Boolean(
      Number(defaultPackage.emptyPackageWeight ?? 0) > 0 &&
        Number(defaultPackage.length ?? 0) > 0 &&
        Number(defaultPackage.width ?? 0) > 0 &&
        Number(defaultPackage.height ?? 0) > 0
    )
  }

  return Boolean(
    (store.defaultPackageWeightOz ?? 0) > 0 &&
      (store.defaultPackageLengthIn ?? 0) > 0 &&
      (store.defaultPackageWidthIn ?? 0) > 0 &&
      (store.defaultPackageHeightIn ?? 0) > 0
  )
}

function hasManualRates(store: any) {
  const hasManualConfigRates = (store.shippingManualRates || []).some((rate: any) => rate.isActive)
  if (hasManualConfigRates) {
    return true
  }

  const hasFallbackRates =
    Number.isInteger(store.shippingDomesticRateCents) && Number.isInteger(store.shippingInternationalRateCents)
  const hasActiveZoneRates = store.shippingZones.some(
    (zone: any) => zone.isActive && zone.rates.some((rate: any) => rate.isActive)
  )

  return hasFallbackRates || hasActiveZoneRates
}

function hasFallbackRate(store: any) {
  const hasConfiguredFallbackRates = (store.shippingFallbackRates || []).some((rate: any) => rate.isActive)
  const hasLegacyFallbackRates =
    Number.isInteger(store.shippingDomesticRateCents) && Number.isInteger(store.shippingInternationalRateCents)

  return hasConfiguredFallbackRates || hasLegacyFallbackRates
}

export async function buildShippingSetupStatus(store: any) {
  const activeRateProvider = resolveActiveRateProvider()
  const labelProvider = resolveLabelProvider()
  const hasProvider = Boolean(activeRateProvider)
  const shipFromEmail = resolveShipFromEmail(store)
  const shipFromPhone = resolveShipFromPhone(store)
  const shippingProviderConnections: ShippingSetupStatus['shippingProviderConnections'] = {
    SHIPPO: {
      connected: false,
      hasCredentials: false,
      selectedForLiveRates: activeRateProvider === 'SHIPPO',
      selectedForLabels: labelProvider === 'SHIPPO',
    },
    EASYPOST: {
      connected: false,
      hasCredentials: false,
      selectedForLiveRates: activeRateProvider === 'EASYPOST',
      selectedForLabels: labelProvider === 'EASYPOST',
    },
  }

  const providerStatuses = await Promise.all([
    getShippingProviderConnectionStatus('SHIPPO'),
    getShippingProviderConnectionStatus('EASYPOST'),
  ])
  for (const providerStatus of providerStatuses) {
    shippingProviderConnections[providerStatus.provider].connected = providerStatus.connected
    shippingProviderConnections[providerStatus.provider].hasCredentials = providerStatus.hasCredentials
  }

  let liveProviderConnected = false
  if (activeRateProvider) {
    liveProviderConnected = shippingProviderConnections[activeRateProvider].connected
  }

  let labelProviderConnected = false
  if (labelProvider) {
    labelProviderConnected = shippingProviderConnections[labelProvider].connected
  }
  const providerConnected = liveProviderConnected || labelProviderConnected

  const originReady = hasOriginAddress(store)
  const packageReady = hasDefaultPackage(store)
  const manualReady = hasManualRates(store)
  const fallbackRateReady = hasFallbackRate(store)
  const mode = store.shippingMode
  const canUseManualRates = mode === 'MANUAL' ? manualReady : mode === 'HYBRID' ? manualReady : false
  const canUseLiveRates =
    (mode === 'LIVE_RATES' || mode === 'HYBRID') &&
    hasProvider &&
    liveProviderConnected &&
    originReady &&
    packageReady
  const shippoLabelContactReady = labelProvider !== 'SHIPPO' || (Boolean(shipFromEmail) && Boolean(shipFromPhone))
  const canBuyLabels =
    originReady && packageReady && Boolean(labelProvider) && labelProviderConnected && shippoLabelContactReady

  const warnings: string[] = []
  const nextSteps: string[] = []

  if (!originReady) {
    warnings.push('Shipping origin address is incomplete.')
    nextSteps.push('Add shipping origin address details.')
  }
  if (!packageReady) {
    warnings.push('Default package dimensions/weight are incomplete.')
    nextSteps.push('Add a default shipping package.')
  }
  if (!manualReady) {
    warnings.push('Manual fallback rates are not configured.')
    nextSteps.push('Configure manual fallback rates.')
  }

  if ((mode === 'LIVE_RATES' || mode === 'HYBRID') && !hasProvider) {
    warnings.push('Live shipping mode is selected but no provider is chosen.')
    nextSteps.push('Set SHIPPING_RATE_PROVIDER in the deployment environment.')
  }
  if ((mode === 'LIVE_RATES' || mode === 'HYBRID') && hasProvider && !liveProviderConnected) {
    warnings.push('Selected shipping provider is not connected yet.')
    nextSteps.push('Configure provider environment credentials and test them in Developer settings.')
  }
  if (mode === 'HYBRID' && store.shippingFallbackEnabled && !manualReady) {
    warnings.push('Hybrid mode requires manual fallback rates.')
    nextSteps.push('Configure manual fallback rates before finishing hybrid setup.')
  }
  if (labelProvider === 'SHIPPO' && !shipFromEmail) {
    warnings.push('Shippo/USPS labels require a ship-from email address.')
    nextSteps.push('Add a ship-from email to your default shipping location or store profile.')
  }
  if (labelProvider === 'SHIPPO' && !shipFromPhone) {
    warnings.push('Shippo/USPS labels require a ship-from phone number.')
    nextSteps.push('Add a ship-from phone number to your default shipping location or store profile.')
  }

  if (warnings.length === 0) {
    nextSteps.push('Shipping setup looks complete.')
  }

  return {
    shippingMode: mode,
    activeRateProvider,
    labelProvider,
    mode,
    hasOriginAddress: originReady,
    hasDefaultPackage: packageReady,
    hasManualRates: manualReady,
    hasFallbackRate: fallbackRateReady,
    hasProvider,
    providerConnected,
    liveProviderConnected,
    labelProviderConnected,
    shippingProviderConnections,
    canUseManualRates,
    canUseLiveRates,
    canBuyLabels,
    warnings,
    nextSteps,
  } satisfies ShippingSetupStatus
}

import { type ShippingLiveProvider, type ShippingMode, type ShippingProviderUsage } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { getShippingProviderConnectionStatus } from '@/server/shipping/shipping-provider.service'
import {
  resolveActiveRateProvider,
  resolveLabelProvider,
} from '@/server/shipping/shipping-provider-selection'

export type ShippingSetupStatus = {
  mode: 'MANUAL' | 'LIVE_RATES' | 'HYBRID'
  hasOriginAddress: boolean
  hasDefaultPackage: boolean
  hasManualRates: boolean
  hasProvider: boolean
  providerConnected: boolean
  liveProviderConnected: boolean
  labelProviderConnected: boolean
  canUseManualRates: boolean
  canUseLiveRates: boolean
  canBuyLabels: boolean
  warnings: string[]
  nextSteps: string[]
}

type ShippingSetupPatch = Partial<{
  shippingMode: ShippingMode
  shippingLiveProvider: ShippingLiveProvider | null
  shippingProviderUsage: ShippingProviderUsage
  shippingOriginName: string | null
  shippingOriginPhone: string | null
  shippingOriginAddress1: string | null
  shippingOriginAddress2: string | null
  shippingOriginCity: string | null
  shippingOriginProvince: string | null
  shippingOriginPostalCode: string | null
  shippingOriginCountry: string | null
  defaultPackageWeightOz: number | null
  defaultPackageLengthIn: number | null
  defaultPackageWidthIn: number | null
  defaultPackageHeightIn: number | null
  defaultLabelFormat: string | null
  defaultLabelSize: string | null
  shippingFallbackEnabled: boolean
  shippingThresholdCents: number | null
  shippingDomesticRateCents: number
  shippingInternationalRateCents: number
}>

function includeStoreRelations() {
  return {
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
        rates: {
          orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }],
        },
      },
      orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }],
    },
  }
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

export async function getShippingSetupStore() {
  return prisma.store.findFirst({
    include: includeStoreRelations(),
  })
}

export async function updateShippingSetup(storeId: string, patch: ShippingSetupPatch) {
  return prisma.store.update({
    where: { id: storeId },
    data: patch,
    include: includeStoreRelations(),
  })
}

export async function buildShippingSetupStatus(store: any) {
  const activeRateProvider = resolveActiveRateProvider(store)
  const labelProvider = resolveLabelProvider(store)
  const hasProvider = Boolean(activeRateProvider)
  const shipFromEmail = resolveShipFromEmail(store)
  const shipFromPhone = resolveShipFromPhone(store)

  let liveProviderConnected = false
  if (activeRateProvider) {
    const providerStatus = await getShippingProviderConnectionStatus(activeRateProvider)
    liveProviderConnected = providerStatus.connected
  }

  let labelProviderConnected = false
  if (labelProvider) {
    if (labelProvider === activeRateProvider) {
      labelProviderConnected = liveProviderConnected
    } else {
      const labelStatus = await getShippingProviderConnectionStatus(labelProvider)
      labelProviderConnected = labelStatus.connected
    }
  }
  const providerConnected = liveProviderConnected || labelProviderConnected

  const originReady = hasOriginAddress(store)
  const packageReady = hasDefaultPackage(store)
  const manualReady = hasManualRates(store)
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
    nextSteps.push('Add origin address details in setup step 2.')
  }
  if (!packageReady) {
    warnings.push('Default package dimensions/weight are incomplete.')
    nextSteps.push('Add a default package in setup step 3.')
  }
  if (!manualReady) {
    warnings.push('Manual fallback rates are not configured.')
    nextSteps.push('Configure manual fallback rates in setup step 4.')
  }

  if ((mode === 'LIVE_RATES' || mode === 'HYBRID') && !hasProvider) {
    warnings.push('Live shipping mode is selected but no provider is chosen.')
    nextSteps.push('Choose a live provider in setup step 5.')
  }
  if ((mode === 'LIVE_RATES' || mode === 'HYBRID') && hasProvider && !liveProviderConnected) {
    warnings.push('Selected shipping provider is not connected yet.')
    nextSteps.push('Connect and test the provider credentials in setup step 5.')
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
    mode,
    hasOriginAddress: originReady,
    hasDefaultPackage: packageReady,
    hasManualRates: manualReady,
    hasProvider,
    providerConnected,
    liveProviderConnected,
    labelProviderConnected,
    canUseManualRates,
    canUseLiveRates,
    canBuyLabels,
    warnings,
    nextSteps,
  } satisfies ShippingSetupStatus
}

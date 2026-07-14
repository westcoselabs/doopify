import type {
  Prisma,
  ShippingFallbackBehavior,
  ShippingDimensionUnit,
  ShippingLiveProvider,
  ShippingManualRateType,
  ShippingMode,
  ShippingPackageType,
  ShippingProviderSelection,
  ShippingProviderUsage,
  ShippingWeightUnit,
} from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { createPrimaryStore, findPrimaryStore } from '@/server/services/primary-store.service'

export class ShippingSettingsStoreNotConfiguredError extends Error {
  constructor(message = 'Store not configured') {
    super(message)
    this.name = 'ShippingSettingsStoreNotConfiguredError'
  }
}

type ShippingStoreWithConfig = Prisma.StoreGetPayload<{
  include: {
    shippingPackages: true
    shippingLocations: true
    shippingManualRates: true
    shippingFallbackRates: true
    shippingZones: {
      include: {
        rates: true
      }
    }
  }
}>

type ShippingSettingsPatch = Partial<{
  shippingMode: ShippingMode
  shippingLiveProvider: ShippingLiveProvider | null
  shippingProviderUsage: ShippingProviderUsage
  activeRateProvider: ShippingProviderSelection
  labelProvider: ShippingProviderSelection
  fallbackBehavior: ShippingFallbackBehavior
  shippingThresholdCents: number | null
  shippingDomesticRateCents: number
  shippingInternationalRateCents: number
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
}>

type ShippingPackageCreateInput = {
  name: string
  type: ShippingPackageType
  length: number
  width: number
  height: number
  dimensionUnit: ShippingDimensionUnit
  emptyPackageWeight: number
  weightUnit: ShippingWeightUnit
  isDefault: boolean
  isActive: boolean
}

type ShippingPackageUpdateInput = Partial<ShippingPackageCreateInput>

type ShippingLocationCreateInput = {
  name: string
  contactName: string | null
  email: string | null
  company: string | null
  address1: string
  address2: string | null
  city: string
  stateProvince: string | null
  postalCode: string
  country: string
  phone: string | null
  isDefault: boolean
  isActive: boolean
}

type ShippingLocationUpdateInput = Partial<ShippingLocationCreateInput>

type ShippingManualRateCreateInput = {
  name: string
  regionCountry: string | null
  regionStateProvince: string | null
  rateType: ShippingManualRateType
  amountCents: number
  minWeight: number | null
  maxWeight: number | null
  minSubtotalCents: number | null
  maxSubtotalCents: number | null
  freeOverAmountCents: number | null
  estimatedDeliveryText: string | null
  isActive: boolean
}

type ShippingManualRateUpdateInput = Partial<ShippingManualRateCreateInput>

type ShippingFallbackRateCreateInput = {
  name: string
  regionCountry: string | null
  regionStateProvince: string | null
  amountCents: number
  estimatedDeliveryText: string | null
  isActive: boolean
}

type ShippingFallbackRateUpdateInput = Partial<ShippingFallbackRateCreateInput>

const SHIPPING_CONFIG_INCLUDE = {
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

async function findPrimaryStoreId() {
  const store = await findPrimaryStore({
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }],
  })
  return store?.id || null
}

async function getExistingStoreId() {
  const storeId = await findPrimaryStoreId()
  if (!storeId) {
    throw new ShippingSettingsStoreNotConfiguredError()
  }
  return storeId
}

async function getOrCreateShippingStoreId() {
  const existingStoreId = await findPrimaryStoreId()
  if (existingStoreId) {
    return existingStoreId
  }

  const createdStore = await createPrimaryStore({
    data: {
      name: 'Doopify Store',
    },
    select: { id: true },
  })

  return createdStore.id
}

async function enforceSingleDefaultPackage(tx: Prisma.TransactionClient, storeId: string, packageId: string) {
  await tx.shippingPackage.updateMany({
    where: {
      storeId,
      id: { not: packageId },
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  })
}

async function enforceSingleDefaultLocation(tx: Prisma.TransactionClient, storeId: string, locationId: string) {
  await tx.shippingLocation.updateMany({
    where: {
      storeId,
      id: { not: locationId },
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  })
}

export async function getShippingDeliveryStore(): Promise<ShippingStoreWithConfig> {
  const store = await findPrimaryStore({
    include: SHIPPING_CONFIG_INCLUDE,
    orderBy: [{ createdAt: 'asc' }],
  })

  if (!store) {
    throw new ShippingSettingsStoreNotConfiguredError()
  }

  return store
}

export async function updateShippingDeliverySettings(input: ShippingSettingsPatch) {
  const storeId = await getExistingStoreId()
  return prisma.store.update({
    where: { id: storeId },
    data: input,
    include: SHIPPING_CONFIG_INCLUDE,
  })
}

export async function createShippingPackage(input: ShippingPackageCreateInput) {
  const storeId = await getOrCreateShippingStoreId()

  return prisma.$transaction(async (tx) => {
    const created = await tx.shippingPackage.create({
      data: {
        storeId,
        ...input,
      },
    })

    if (created.isDefault) {
      await enforceSingleDefaultPackage(tx, storeId, created.id)
    }

    return created
  })
}

export async function updateShippingPackage(packageId: string, input: ShippingPackageUpdateInput) {
  const storeId = await getExistingStoreId()

  return prisma.$transaction(async (tx) => {
    const existing = await tx.shippingPackage.findFirst({
      where: {
        id: packageId,
        storeId,
      },
    })

    if (!existing) {
      throw new Error('Package not found')
    }

    const updated = await tx.shippingPackage.update({
      where: { id: packageId },
      data: input,
    })

    if (updated.isDefault) {
      await enforceSingleDefaultPackage(tx, storeId, updated.id)
    }

    return updated
  })
}

export async function deleteShippingPackage(packageId: string) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingPackage.findFirst({
    where: {
      id: packageId,
      storeId,
    },
    select: {
      id: true,
      isDefault: true,
    },
  })

  if (!existing) {
    throw new Error('Package not found')
  }

  await prisma.shippingPackage.delete({ where: { id: packageId } })
}

export async function createShippingLocation(input: ShippingLocationCreateInput) {
  const storeId = await getOrCreateShippingStoreId()

  return prisma.$transaction(async (tx) => {
    const created = await tx.shippingLocation.create({
      data: {
        storeId,
        ...input,
      },
    })

    if (created.isDefault) {
      await enforceSingleDefaultLocation(tx, storeId, created.id)
    }

    return created
  })
}

export async function updateShippingLocation(locationId: string, input: ShippingLocationUpdateInput) {
  const storeId = await getExistingStoreId()

  return prisma.$transaction(async (tx) => {
    const existing = await tx.shippingLocation.findFirst({
      where: {
        id: locationId,
        storeId,
      },
    })

    if (!existing) {
      throw new Error('Ship-from location not found')
    }

    const updated = await tx.shippingLocation.update({
      where: { id: locationId },
      data: input,
    })

    if (updated.isDefault) {
      await enforceSingleDefaultLocation(tx, storeId, updated.id)
    }

    return updated
  })
}

export async function deleteShippingLocation(locationId: string) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingLocation.findFirst({
    where: {
      id: locationId,
      storeId,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error('Ship-from location not found')
  }

  await prisma.shippingLocation.delete({ where: { id: locationId } })
}

export async function createShippingManualRate(input: ShippingManualRateCreateInput) {
  const storeId = await getOrCreateShippingStoreId()

  return prisma.shippingManualRate.create({
    data: {
      storeId,
      ...input,
    },
  })
}

export async function updateShippingManualRate(rateId: string, input: ShippingManualRateUpdateInput) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingManualRate.findFirst({
    where: {
      id: rateId,
      storeId,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error('Manual shipping rate not found')
  }

  return prisma.shippingManualRate.update({
    where: { id: rateId },
    data: input,
  })
}

export async function deleteShippingManualRate(rateId: string) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingManualRate.findFirst({
    where: {
      id: rateId,
      storeId,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error('Manual shipping rate not found')
  }

  await prisma.shippingManualRate.delete({ where: { id: rateId } })
}

export async function createShippingFallbackRate(input: ShippingFallbackRateCreateInput) {
  const storeId = await getOrCreateShippingStoreId()

  return prisma.shippingFallbackRate.create({
    data: {
      storeId,
      ...input,
    },
  })
}

export async function updateShippingFallbackRate(rateId: string, input: ShippingFallbackRateUpdateInput) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingFallbackRate.findFirst({
    where: {
      id: rateId,
      storeId,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error('Fallback shipping rate not found')
  }

  return prisma.shippingFallbackRate.update({
    where: { id: rateId },
    data: input,
  })
}

export async function deleteShippingFallbackRate(rateId: string) {
  const storeId = await getExistingStoreId()

  const existing = await prisma.shippingFallbackRate.findFirst({
    where: {
      id: rateId,
      storeId,
    },
    select: {
      id: true,
    },
  })

  if (!existing) {
    throw new Error('Fallback shipping rate not found')
  }

  await prisma.shippingFallbackRate.delete({ where: { id: rateId } })
}

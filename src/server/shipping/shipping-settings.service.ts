import {
  type Prisma,
  type ShippingFallbackBehavior,
  type ShippingMode,
} from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { findPrimaryStore } from '@/server/services/primary-store.service'

type ShippingSettingsUpdate = Partial<{
  shippingMode: ShippingMode
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

export async function getShippingSettingsStore() {
  return findPrimaryStore({
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
    },
  })
}

export async function updateShippingSettings(storeId: string, input: ShippingSettingsUpdate) {
  return prisma.store.update({
    where: { id: storeId },
    data: input,
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
    },
  })
}

const shippingWorkspaceSelect = {
  id: true,
  country: true,
  currency: true,
  shippingMode: true,
  fallbackBehavior: true,
  shippingFallbackEnabled: true,
  email: true,
  phone: true,
  supportEmail: true,
  shippingOriginPhone: true,
  manualFulfillmentInstructions: true,
  manualTrackingBehavior: true,
  localDeliveryEnabled: true,
  localDeliveryPriceCents: true,
  localDeliveryMinimumOrderCents: true,
  localDeliveryCoverage: true,
  localDeliveryInstructions: true,
  pickupEnabled: true,
  pickupLocation: true,
  pickupInstructions: true,
  pickupEstimate: true,
  packingSlipUseLogo: true,
  packingSlipShowSku: true,
  packingSlipShowProductImages: true,
  packingSlipFooterNote: true,
  shippingPackages:  { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
  shippingLocations:  { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
  shippingManualRates:  { orderBy: { createdAt: "asc" } },
  shippingFallbackRates:  { orderBy: { createdAt: "asc" } },
} satisfies Prisma.StoreSelect

export function getShippingWorkspaceSettings() {
  return findPrimaryStore({ select: shippingWorkspaceSelect });
}

export function updateShippingWorkspaceSettings(storeId: string, input: ShippingSettingsUpdate) {
  return prisma.store.update({ where: { id: storeId }, data: input, select: shippingWorkspaceSelect });
}

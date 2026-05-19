import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { requireAdmin } from '@/server/auth/require-auth'
import { auditActorFromUser, recordAuditLogBestEffort } from '@/server/services/audit-log.service'
import {
  buildLegacyProviderFields,
  resolveActiveRateProvider,
  resolveLabelProvider,
} from '@/server/shipping/shipping-provider-selection'
import {
  getShippingSettingsStore,
  updateShippingSettings,
} from '@/server/shipping/shipping-settings.service'

function serializeShippingSettings(
  store: any
) {
  return {
    storeId: store.id,
    storeCountry: store.country,
    shippingMode: store.shippingMode,
    activeRateProvider: resolveActiveRateProvider(store) || 'NONE',
    labelProvider: resolveLabelProvider(store) || 'NONE',
    fallbackBehavior:
      store.fallbackBehavior || (store.shippingFallbackEnabled === false ? 'HIDE_SHIPPING' : 'SHOW_FALLBACK'),
    shippingLiveProvider: store.shippingLiveProvider,
    shippingProviderUsage: store.shippingProviderUsage,
    shippingOriginName: store.shippingOriginName,
    shippingOriginPhone: store.shippingOriginPhone,
    shippingOriginAddress1: store.shippingOriginAddress1,
    shippingOriginAddress2: store.shippingOriginAddress2,
    shippingOriginCity: store.shippingOriginCity,
    shippingOriginProvince: store.shippingOriginProvince,
    shippingOriginPostalCode: store.shippingOriginPostalCode,
    shippingOriginCountry: store.shippingOriginCountry,
    email: store.email,
    phone: store.phone,
    supportEmail: store.supportEmail,
    supportPhone:
      typeof (store as Record<string, unknown>).supportPhone === 'string'
        ? ((store as Record<string, unknown>).supportPhone as string)
        : null,
    defaultPackageWeightOz: store.defaultPackageWeightOz,
    defaultPackageLengthIn: store.defaultPackageLengthIn,
    defaultPackageWidthIn: store.defaultPackageWidthIn,
    defaultPackageHeightIn: store.defaultPackageHeightIn,
    defaultLabelFormat: store.defaultLabelFormat,
    defaultLabelSize: store.defaultLabelSize,
    shippingFallbackEnabled: store.shippingFallbackEnabled,
    shippingThreshold: store.shippingThresholdCents == null ? null : centsToDollars(store.shippingThresholdCents),
    shippingDomesticRate: centsToDollars(store.shippingDomesticRateCents),
    shippingInternationalRate: centsToDollars(store.shippingInternationalRateCents),
    manualFulfillmentInstructions: store.manualFulfillmentInstructions,
    manualTrackingBehavior: store.manualTrackingBehavior,
    localDeliveryEnabled: store.localDeliveryEnabled,
    localDeliveryPrice:
      store.localDeliveryPriceCents == null ? null : centsToDollars(store.localDeliveryPriceCents),
    localDeliveryMinimumOrder:
      store.localDeliveryMinimumOrderCents == null
        ? null
        : centsToDollars(store.localDeliveryMinimumOrderCents),
    localDeliveryCoverage: store.localDeliveryCoverage,
    localDeliveryInstructions: store.localDeliveryInstructions,
    pickupEnabled: store.pickupEnabled,
    pickupLocation: store.pickupLocation,
    pickupInstructions: store.pickupInstructions,
    pickupEstimate: store.pickupEstimate,
    packingSlipUseLogo: store.packingSlipUseLogo,
    packingSlipShowSku: store.packingSlipShowSku,
    packingSlipShowProductImages: store.packingSlipShowProductImages,
    packingSlipFooterNote: store.packingSlipFooterNote,
    shippingPackages: (store.shippingPackages || []).map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      length: entry.length,
      width: entry.width,
      height: entry.height,
      dimensionUnit: entry.dimensionUnit,
      emptyPackageWeight: entry.emptyPackageWeight,
      weightUnit: entry.weightUnit,
      isDefault: entry.isDefault,
      isActive: entry.isActive,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    shippingLocations: (store.shippingLocations || []).map((location: any) => ({
      id: location.id,
      name: location.name,
      contactName: location.contactName,
      email: location.email,
      company: location.company,
      address1: location.address1,
      address2: location.address2,
      city: location.city,
      stateProvince: location.stateProvince,
      postalCode: location.postalCode,
      country: location.country,
      phone: location.phone,
      isDefault: location.isDefault,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    })),
    shippingManualRates: (store.shippingManualRates || []).map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      regionCountry: rate.regionCountry,
      regionStateProvince: rate.regionStateProvince,
      rateType: rate.rateType,
      amount: centsToDollars(rate.amountCents),
      amountCents: rate.amountCents,
      minWeight: rate.minWeight,
      maxWeight: rate.maxWeight,
      minSubtotal: rate.minSubtotalCents == null ? null : centsToDollars(rate.minSubtotalCents),
      maxSubtotal: rate.maxSubtotalCents == null ? null : centsToDollars(rate.maxSubtotalCents),
      freeOverAmount: rate.freeOverAmountCents == null ? null : centsToDollars(rate.freeOverAmountCents),
      estimatedDeliveryText: rate.estimatedDeliveryText,
      isActive: rate.isActive,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    })),
    shippingFallbackRates: (store.shippingFallbackRates || []).map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      regionCountry: rate.regionCountry,
      regionStateProvince: rate.regionStateProvince,
      amount: centsToDollars(rate.amountCents),
      amountCents: rate.amountCents,
      estimatedDeliveryText: rate.estimatedDeliveryText,
      isActive: rate.isActive,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    })),
    shippingZones: store.shippingZones.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      countryCode: zone.countryCode,
      provinceCode: zone.provinceCode,
      isActive: zone.isActive,
      priority: zone.priority,
      rates: zone.rates.map((rate: any) => ({
        id: rate.id,
        name: rate.name,
        method: rate.method,
        amount: centsToDollars(rate.amountCents),
        minSubtotal: rate.minSubtotalCents == null ? null : centsToDollars(rate.minSubtotalCents),
        maxSubtotal: rate.maxSubtotalCents == null ? null : centsToDollars(rate.maxSubtotalCents),
        isActive: rate.isActive,
        priority: rate.priority,
      })),
    })),
  }
}

const updateShippingSettingsSchema = z.object({
  shippingMode: z.enum(['MANUAL', 'LIVE_RATES', 'HYBRID']).optional(),
  activeRateProvider: z.enum(['NONE', 'EASYPOST', 'SHIPPO']).optional(),
  labelProvider: z.enum(['NONE', 'EASYPOST', 'SHIPPO']).optional(),
  fallbackBehavior: z.enum(['SHOW_FALLBACK', 'HIDE_SHIPPING', 'MANUAL_QUOTE']).optional(),
  shippingLiveProvider: z.enum(['EASYPOST', 'SHIPPO']).nullable().optional(),
  shippingProviderUsage: z.enum(['LIVE_AND_LABELS', 'LABELS_ONLY', 'LIVE_RATES_ONLY']).optional(),
  shippingThreshold: z.number().min(0).nullable().optional(),
  shippingDomesticRate: z.number().min(0).optional(),
  shippingInternationalRate: z.number().min(0).optional(),
  manualFulfillmentInstructions: z.string().trim().max(500).nullable().optional(),
  manualTrackingBehavior: z.string().trim().max(160).nullable().optional(),
  localDeliveryEnabled: z.boolean().optional(),
  localDeliveryPrice: z.number().min(0).nullable().optional(),
  localDeliveryMinimumOrder: z.number().min(0).nullable().optional(),
  localDeliveryCoverage: z.string().trim().max(500).nullable().optional(),
  localDeliveryInstructions: z.string().trim().max(500).nullable().optional(),
  pickupEnabled: z.boolean().optional(),
  pickupLocation: z.string().trim().max(200).nullable().optional(),
  pickupInstructions: z.string().trim().max(500).nullable().optional(),
  pickupEstimate: z.string().trim().max(160).nullable().optional(),
  packingSlipUseLogo: z.boolean().optional(),
  packingSlipShowSku: z.boolean().optional(),
  packingSlipShowProductImages: z.boolean().optional(),
  packingSlipFooterNote: z.string().trim().max(500).nullable().optional(),
})

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const store = await getShippingSettingsStore()
    if (!store) return err('Store not configured', 404)

    return ok(serializeShippingSettings(store))
  } catch (error) {
    console.error('[GET /api/settings/shipping]', error)
    return err('Failed to load shipping settings', 500)
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = updateShippingSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Shipping settings payload is invalid', parsed.error.flatten())
  }

  try {
    const store = await getShippingSettingsStore()
    if (!store) return err('Store not configured', 404)

    const activeRateProvider = parsed.data.activeRateProvider
    const labelProvider = parsed.data.labelProvider
    const providerFields =
      activeRateProvider !== undefined || labelProvider !== undefined
        ? buildLegacyProviderFields({
            activeRateProvider: activeRateProvider ?? null,
            labelProvider: labelProvider ?? null,
          })
        : null
    const nextLegacyProvider = {
      shippingLiveProvider:
        parsed.data.shippingLiveProvider !== undefined
          ? parsed.data.shippingLiveProvider
          : store.shippingLiveProvider,
      shippingProviderUsage:
        parsed.data.shippingProviderUsage !== undefined
          ? parsed.data.shippingProviderUsage
          : store.shippingProviderUsage,
    }
    const selectionFieldsFromLegacy: Partial<{
      activeRateProvider: 'NONE' | 'EASYPOST' | 'SHIPPO'
      labelProvider: 'NONE' | 'EASYPOST' | 'SHIPPO'
    }> =
      parsed.data.activeRateProvider === undefined &&
      parsed.data.labelProvider === undefined &&
      (parsed.data.shippingLiveProvider !== undefined || parsed.data.shippingProviderUsage !== undefined)
        ? {
            activeRateProvider: resolveActiveRateProvider(nextLegacyProvider) || 'NONE',
            labelProvider: resolveLabelProvider(nextLegacyProvider) || 'NONE',
          }
        : {}

    const updated = await updateShippingSettings(store.id, {
      ...(parsed.data.shippingMode !== undefined ? { shippingMode: parsed.data.shippingMode } : {}),
      ...(parsed.data.activeRateProvider !== undefined
        ? { activeRateProvider: parsed.data.activeRateProvider }
        : {}),
      ...(parsed.data.labelProvider !== undefined ? { labelProvider: parsed.data.labelProvider } : {}),
      ...(parsed.data.fallbackBehavior !== undefined ? { fallbackBehavior: parsed.data.fallbackBehavior } : {}),
      ...(parsed.data.shippingLiveProvider !== undefined
        ? { shippingLiveProvider: parsed.data.shippingLiveProvider }
        : {}),
      ...(parsed.data.shippingProviderUsage !== undefined
        ? { shippingProviderUsage: parsed.data.shippingProviderUsage }
        : {}),
      ...(providerFields ? providerFields : {}),
      ...selectionFieldsFromLegacy,
      ...(parsed.data.shippingThreshold !== undefined
        ? {
            shippingThresholdCents:
              parsed.data.shippingThreshold == null ? null : dollarsToCents(parsed.data.shippingThreshold),
          }
        : {}),
      ...(parsed.data.shippingDomesticRate !== undefined
        ? {
            shippingDomesticRateCents: dollarsToCents(parsed.data.shippingDomesticRate),
          }
        : {}),
      ...(parsed.data.shippingInternationalRate !== undefined
        ? {
            shippingInternationalRateCents: dollarsToCents(parsed.data.shippingInternationalRate),
          }
        : {}),
      ...(parsed.data.manualFulfillmentInstructions !== undefined
        ? { manualFulfillmentInstructions: parsed.data.manualFulfillmentInstructions?.trim() || null }
        : {}),
      ...(parsed.data.manualTrackingBehavior !== undefined
        ? { manualTrackingBehavior: parsed.data.manualTrackingBehavior?.trim() || null }
        : {}),
      ...(parsed.data.localDeliveryEnabled !== undefined
        ? { localDeliveryEnabled: parsed.data.localDeliveryEnabled }
        : {}),
      ...(parsed.data.localDeliveryPrice !== undefined
        ? {
            localDeliveryPriceCents:
              parsed.data.localDeliveryPrice == null ? null : dollarsToCents(parsed.data.localDeliveryPrice),
          }
        : {}),
      ...(parsed.data.localDeliveryMinimumOrder !== undefined
        ? {
            localDeliveryMinimumOrderCents:
              parsed.data.localDeliveryMinimumOrder == null
                ? null
                : dollarsToCents(parsed.data.localDeliveryMinimumOrder),
          }
        : {}),
      ...(parsed.data.localDeliveryCoverage !== undefined
        ? { localDeliveryCoverage: parsed.data.localDeliveryCoverage?.trim() || null }
        : {}),
      ...(parsed.data.localDeliveryInstructions !== undefined
        ? { localDeliveryInstructions: parsed.data.localDeliveryInstructions?.trim() || null }
        : {}),
      ...(parsed.data.pickupEnabled !== undefined ? { pickupEnabled: parsed.data.pickupEnabled } : {}),
      ...(parsed.data.pickupLocation !== undefined
        ? { pickupLocation: parsed.data.pickupLocation?.trim() || null }
        : {}),
      ...(parsed.data.pickupInstructions !== undefined
        ? { pickupInstructions: parsed.data.pickupInstructions?.trim() || null }
        : {}),
      ...(parsed.data.pickupEstimate !== undefined
        ? { pickupEstimate: parsed.data.pickupEstimate?.trim() || null }
        : {}),
      ...(parsed.data.packingSlipUseLogo !== undefined
        ? { packingSlipUseLogo: parsed.data.packingSlipUseLogo }
        : {}),
      ...(parsed.data.packingSlipShowSku !== undefined
        ? { packingSlipShowSku: parsed.data.packingSlipShowSku }
        : {}),
      ...(parsed.data.packingSlipShowProductImages !== undefined
        ? { packingSlipShowProductImages: parsed.data.packingSlipShowProductImages }
        : {}),
      ...(parsed.data.packingSlipFooterNote !== undefined
        ? { packingSlipFooterNote: parsed.data.packingSlipFooterNote?.trim() || null }
        : {}),
    })

    await recordAuditLogBestEffort({
      action: 'shipping.settings_updated',
      actor: auditActorFromUser(auth.user),
      resource: { type: 'Store', id: store.id },
      summary: `Shipping settings updated by ${auth.user.email}`,
      snapshot: {
        storeId: store.id,
        updatedFields: Object.keys(parsed.data).sort(),
        shippingMode: updated.shippingMode,
        activeRateProvider: updated.activeRateProvider,
        labelProvider: updated.labelProvider,
        fallbackBehavior: updated.fallbackBehavior,
      },
    })

    return ok(serializeShippingSettings(updated))
  } catch (error) {
    console.error('[PATCH /api/settings/shipping]', error)
    const message = error instanceof Error ? error.message : 'Failed to update shipping settings'
    return err(message, 400)
  }
}

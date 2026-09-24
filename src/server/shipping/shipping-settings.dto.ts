import type { getShippingSettingsStore } from "./shipping-settings.service";
import { centsToDollars } from "@/lib/money";
import {
  resolveActiveRateProvider,
  resolveLabelProvider,
} from "./shipping-provider-selection";

export function serializeShippingSettings(
  store: NonNullable<Awaited<ReturnType<typeof getShippingSettingsStore>>>,
) {
  return {
    storeId: store.id,
    storeCountry: store.country,
    shippingMode: store.shippingMode,
    activeRateProvider: resolveActiveRateProvider() || "NONE",
    labelProvider: resolveLabelProvider() || "NONE",
    fallbackBehavior:
      store.fallbackBehavior ||
      (store.shippingFallbackEnabled === false
        ? "HIDE_SHIPPING"
        : "SHOW_FALLBACK"),
    currency: store.currency,
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
      typeof (store as Record<string, unknown>).supportPhone === "string"
        ? ((store as Record<string, unknown>).supportPhone as string)
        : null,
    defaultPackageWeightOz: store.defaultPackageWeightOz,
    defaultPackageLengthIn: store.defaultPackageLengthIn,
    defaultPackageWidthIn: store.defaultPackageWidthIn,
    defaultPackageHeightIn: store.defaultPackageHeightIn,
    defaultLabelFormat: store.defaultLabelFormat,
    defaultLabelSize: store.defaultLabelSize,
    shippingFallbackEnabled: store.shippingFallbackEnabled,
    shippingThreshold:
      store.shippingThresholdCents == null
        ? null
        : centsToDollars(store.shippingThresholdCents),
    shippingDomesticRate: centsToDollars(store.shippingDomesticRateCents),
    shippingInternationalRate: centsToDollars(
      store.shippingInternationalRateCents,
    ),
    manualFulfillmentInstructions: store.manualFulfillmentInstructions,
    manualTrackingBehavior: store.manualTrackingBehavior,
    localDeliveryEnabled: store.localDeliveryEnabled,
    localDeliveryPrice:
      store.localDeliveryPriceCents == null
        ? null
        : centsToDollars(store.localDeliveryPriceCents),
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
      minSubtotal:
        rate.minSubtotalCents == null
          ? null
          : centsToDollars(rate.minSubtotalCents),
      maxSubtotal:
        rate.maxSubtotalCents == null
          ? null
          : centsToDollars(rate.maxSubtotalCents),
      freeOverAmount:
        rate.freeOverAmountCents == null
          ? null
          : centsToDollars(rate.freeOverAmountCents),
      estimatedDeliveryText: rate.estimatedDeliveryText,
      isActive: rate.isActive,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    })),
    shippingFallbackRates: (store.shippingFallbackRates || []).map(
      (rate: any) => ({
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
      }),
    ),
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
        minSubtotal:
          rate.minSubtotalCents == null
            ? null
            : centsToDollars(rate.minSubtotalCents),
        maxSubtotal:
          rate.maxSubtotalCents == null
            ? null
            : centsToDollars(rate.maxSubtotalCents),
        isActive: rate.isActive,
        priority: rate.priority,
      })),
    })),
  };
}

import { canPurchaseProduct, getVariantInventoryReadiness, resolveEffectiveSalesMode } from '@/server/services/product-availability.service'

export type ProductReadinessState =
  | 'ready'
  | 'needs_price'
  | 'needs_inventory'
  | 'needs_weight'
  | 'needs_media'
  | 'draft'
  | 'coming_soon'
  | 'presale_warning'

type ProductReadinessVariantInput = {
  priceCents?: number | null
  inventory?: number | null
  continueSellingWhenOutOfStock?: boolean | null
  weight?: number | null
}

type ProductReadinessProductInput = {
  status?: string | null
  salesMode?: 'STANDARD' | 'COMING_SOON' | 'PRESALE' | null
  presaleStartsAt?: Date | string | null
  presaleEndsAt?: Date | string | null
  availableForPurchaseAt?: Date | string | null
  fulfillmentType?: 'PHYSICAL' | 'DIGITAL' | null
  media?: Array<{ id: string }> | null
  variants?: ProductReadinessVariantInput[] | null
}

export type ProductReadinessResult = {
  state: ProductReadinessState
  purchasable: boolean
  effectiveSalesMode: 'STANDARD' | 'COMING_SOON' | 'PRESALE'
  hasValidPrice: boolean
  inventoryReady: boolean
  backorderOnly: boolean
  hasPositiveInventory: boolean
  hasBackorderVariant: boolean
  missingWeight: boolean
  hasMedia: boolean
}

function hasMissingWeight(input: ProductReadinessProductInput, variants: ProductReadinessVariantInput[]) {
  if ((input.fulfillmentType ?? 'PHYSICAL') !== 'PHYSICAL') return false
  if (variants.length === 0) return true

  return variants.some((variant) => {
    const weight = Number(variant.weight ?? 0)
    return !Number.isFinite(weight) || weight <= 0
  })
}

export function evaluateProductReadiness(
  input: ProductReadinessProductInput,
  now = new Date()
): ProductReadinessResult {
  const variants = input.variants ?? []
  const status = String(input.status || 'ACTIVE').toUpperCase()
  const effectiveSalesMode = resolveEffectiveSalesMode(input, now)
  const purchasable = canPurchaseProduct(input, now).ok
  const inventoryReadiness = getVariantInventoryReadiness(variants)
  const hasValidPrice = variants.some((variant) => Number(variant.priceCents) > 0)
  const missingWeight = hasMissingWeight(input, variants)
  const hasMedia = Array.isArray(input.media) && input.media.length > 0
  const isPresaleWithoutBackorderFallback =
    input.salesMode === 'PRESALE' &&
    effectiveSalesMode === 'PRESALE' &&
    !inventoryReadiness.hasBackorderVariant

  let state: ProductReadinessState = 'ready'
  if (status !== 'ACTIVE') {
    state = 'draft'
  } else if (effectiveSalesMode === 'COMING_SOON') {
    state = 'coming_soon'
  } else if (!hasValidPrice) {
    state = 'needs_price'
  } else if (!inventoryReadiness.inventoryReady) {
    state = 'needs_inventory'
  } else if (missingWeight) {
    state = 'needs_weight'
  } else if (!hasMedia) {
    state = 'needs_media'
  } else if (isPresaleWithoutBackorderFallback) {
    state = 'presale_warning'
  }

  return {
    state,
    purchasable,
    effectiveSalesMode,
    hasValidPrice,
    inventoryReady: inventoryReadiness.inventoryReady,
    backorderOnly: inventoryReadiness.backorderOnly,
    hasPositiveInventory: inventoryReadiness.hasPositiveInventory,
    hasBackorderVariant: inventoryReadiness.hasBackorderVariant,
    missingWeight,
    hasMedia,
  }
}

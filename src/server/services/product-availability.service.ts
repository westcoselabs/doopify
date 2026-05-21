import type { ProductFulfillmentType, ProductSalesMode } from '@prisma/client'

type AvailabilityProduct = {
  salesMode?: ProductSalesMode | null
  presaleStartsAt?: Date | string | null
  presaleEndsAt?: Date | string | null
  availableForPurchaseAt?: Date | string | null
  availabilityMessage?: string | null
  expectedDeliveryText?: string | null
  storefrontBadgeText?: string | null
  fulfillmentType?: ProductFulfillmentType | null
}

type AvailabilityVariant = {
  inventory?: number | null
  continueSellingWhenOutOfStock?: boolean | null
}

export type VariantInventoryReadiness = {
  hasPositiveInventory: boolean
  hasBackorderVariant: boolean
  backorderOnly: boolean
  inventoryReady: boolean
}

export type ProductAvailabilityBadge =
  | 'COMING_SOON'
  | 'PRESALE'
  | 'BACKORDER'
  | 'SOLD_OUT'
  | null

function toDate(value?: Date | string | null): Date | null {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isFutureDate(value?: Date | string | null, now = new Date()) {
  const parsed = toDate(value)
  if (!parsed) {
    return false
  }
  return parsed.getTime() > now.getTime()
}

function hasReached(value?: Date | string | null, now = new Date()) {
  const parsed = toDate(value)
  if (!parsed) {
    return true
  }
  return parsed.getTime() <= now.getTime()
}

export function resolveEffectiveSalesMode(
  product: AvailabilityProduct,
  now = new Date()
): ProductSalesMode {
  const salesMode = product.salesMode ?? 'STANDARD'

  if (salesMode === 'COMING_SOON') {
    const availableForPurchaseAt = toDate(product.availableForPurchaseAt)
    if (!availableForPurchaseAt) {
      return 'COMING_SOON'
    }
    return availableForPurchaseAt.getTime() <= now.getTime() ? 'STANDARD' : 'COMING_SOON'
  }

  if (salesMode === 'PRESALE') {
    if (!hasReached(product.presaleStartsAt, now)) {
      return 'COMING_SOON'
    }
    const presaleEndsAt = toDate(product.presaleEndsAt)
    if (presaleEndsAt && presaleEndsAt.getTime() <= now.getTime()) {
      return 'STANDARD'
    }
    return 'PRESALE'
  }

  return 'STANDARD'
}

export function canPurchaseProduct(product: AvailabilityProduct, now = new Date()) {
  const mode = resolveEffectiveSalesMode(product, now)

  if (mode === 'COMING_SOON') {
    return {
      ok: false,
      reason:
        product.availabilityMessage?.trim() ||
        'This product is coming soon and is not available for purchase yet.',
    }
  }

  return { ok: true as const }
}

export function canPurchaseVariant(
  product: AvailabilityProduct,
  variant: AvailabilityVariant,
  quantity: number,
  now = new Date()
) {
  const purchasable = canPurchaseProduct(product, now)
  if (!purchasable.ok) {
    return purchasable
  }

  const requestedQuantity = Math.max(0, Number(quantity || 0))
  const inventory = Number(variant.inventory ?? 0)
  const continueSelling = Boolean(variant.continueSellingWhenOutOfStock)

  if (!continueSelling && inventory < requestedQuantity) {
    return {
      ok: false as const,
      reason: `Only ${Math.max(inventory, 0)} units left for this variant.`,
    }
  }

  return { ok: true as const }
}

export function getVariantInventoryReadiness(
  variants: AvailabilityVariant[]
): VariantInventoryReadiness {
  const totalPositiveInventory = variants.reduce(
    (sum, variant) => sum + Math.max(0, Number(variant.inventory ?? 0)),
    0
  )
  const hasPositiveInventory = totalPositiveInventory > 0
  const hasBackorderVariant = variants.some(
    (variant) => Boolean(variant.continueSellingWhenOutOfStock)
  )

  return {
    hasPositiveInventory,
    hasBackorderVariant,
    backorderOnly: !hasPositiveInventory && hasBackorderVariant,
    inventoryReady: hasPositiveInventory || hasBackorderVariant,
  }
}

export function getProductAvailabilityBadge(input: {
  product: AvailabilityProduct
  variants: AvailabilityVariant[]
  now?: Date
}): ProductAvailabilityBadge {
  const now = input.now ?? new Date()
  const mode = resolveEffectiveSalesMode(input.product, now)

  if (mode === 'COMING_SOON') {
    return 'COMING_SOON'
  }

  if (mode === 'PRESALE') {
    return 'PRESALE'
  }

  const readiness = getVariantInventoryReadiness(input.variants)

  if (readiness.backorderOnly) {
    return 'BACKORDER'
  }

  if (!readiness.inventoryReady) {
    return 'SOLD_OUT'
  }

  return null
}

export function getAvailabilityMessage(input: {
  product: AvailabilityProduct
  badge: ProductAvailabilityBadge
}) {
  if (input.product.availabilityMessage?.trim()) {
    return input.product.availabilityMessage.trim()
  }

  if (input.badge === 'PRESALE') {
    if (input.product.expectedDeliveryText?.trim()) {
      return `Presale: ${input.product.expectedDeliveryText.trim()}`
    }
    return 'Available for presale.'
  }

  if (input.badge === 'COMING_SOON') {
    return 'Coming soon.'
  }

  if (input.badge === 'BACKORDER') {
    return 'Available on backorder.'
  }

  if (input.badge === 'SOLD_OUT') {
    return 'Currently sold out.'
  }

  return null
}

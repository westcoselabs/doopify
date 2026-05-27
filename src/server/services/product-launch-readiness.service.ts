import { evaluateProductReadiness } from '@/server/services/product-readiness.service'

export type ProductLaunchReadinessSample = {
  id: string
  title: string
}

export type ProductLaunchReadinessInput = {
  id: string
  title: string
  salesMode: 'STANDARD' | 'COMING_SOON' | 'PRESALE'
  presaleStartsAt?: Date | string | null
  presaleEndsAt?: Date | string | null
  availableForPurchaseAt?: Date | string | null
  fulfillmentType: 'PHYSICAL' | 'DIGITAL'
  media: Array<{ id: string }>
  variants: Array<{
    priceCents: number
    inventory: number
    continueSellingWhenOutOfStock: boolean
    weight?: number | null
  }>
}

export type ProductLaunchReadinessFacts = {
  activeProductCount: number
  activePurchasableProductCount: number
  activeProductsWithValidPrice: number
  activePurchasableProductsWithValidPrice: number
  activeProductsMissingValidPrice: number
  activeProductsWithInventory: number
  activeProductsSellableOnBackorder: number
  activeProductsInventoryReady: number
  activeProductsWithoutSellableInventory: number
  activeComingSoonProductCount: number
  activePresaleProductCount: number
  activePresaleNotSellableProductCount: number
  activePhysicalProductsMissingWeight: number
  activeProductsWithMedia: number
  samples: {
    missingPrice: ProductLaunchReadinessSample[]
    missingWeight: ProductLaunchReadinessSample[]
    unsellableInventory: ProductLaunchReadinessSample[]
    comingSoon: ProductLaunchReadinessSample[]
    presaleNotSellable: ProductLaunchReadinessSample[]
  }
}

function sampleOf(
  products: ProductLaunchReadinessInput[],
  max = 3
): ProductLaunchReadinessSample[] {
  return products.slice(0, max).map((product) => ({
    id: product.id,
    title: product.title,
  }))
}

export function evaluateProductLaunchReadiness(
  products: ProductLaunchReadinessInput[],
  now = new Date()
): ProductLaunchReadinessFacts {
  let activePurchasableProductCount = 0
  let activeProductsWithValidPrice = 0
  let activePurchasableProductsWithValidPrice = 0
  let activeProductsMissingValidPrice = 0
  let activeProductsWithInventory = 0
  let activeProductsSellableOnBackorder = 0
  let activeProductsInventoryReady = 0
  let activeProductsWithoutSellableInventory = 0
  let activeComingSoonProductCount = 0
  let activePresaleProductCount = 0
  let activePresaleNotSellableProductCount = 0
  let activePhysicalProductsMissingWeight = 0
  let activeProductsWithMedia = 0

  const missingPriceProducts: ProductLaunchReadinessInput[] = []
  const missingWeightProducts: ProductLaunchReadinessInput[] = []
  const unsellableInventoryProducts: ProductLaunchReadinessInput[] = []
  const comingSoonProducts: ProductLaunchReadinessInput[] = []
  const presaleNotSellableProducts: ProductLaunchReadinessInput[] = []

  for (const product of products) {
    const readiness = evaluateProductReadiness(product, now)
    const purchasable = readiness.purchasable
    const hasValidPrice = readiness.hasValidPrice

    if (readiness.effectiveSalesMode === 'COMING_SOON') {
      activeComingSoonProductCount++
      comingSoonProducts.push(product)
    }

    if (readiness.effectiveSalesMode === 'PRESALE') {
      activePresaleProductCount++
    }

    if (product.salesMode === 'PRESALE' && !purchasable) {
      activePresaleNotSellableProductCount++
      presaleNotSellableProducts.push(product)
    }

    if (hasValidPrice) {
      activeProductsWithValidPrice++
    } else {
      activeProductsMissingValidPrice++
      missingPriceProducts.push(product)
    }

    if (readiness.missingWeight) {
      activePhysicalProductsMissingWeight++
      missingWeightProducts.push(product)
    }

    if (readiness.hasMedia) {
      activeProductsWithMedia++
    }

    if (purchasable) {
      activePurchasableProductCount++

      if (hasValidPrice) {
        activePurchasableProductsWithValidPrice++
      }

      if (readiness.hasPositiveInventory) {
        activeProductsWithInventory++
      }

      if (readiness.backorderOnly) {
        activeProductsSellableOnBackorder++
      }

      if (readiness.inventoryReady) {
        activeProductsInventoryReady++
      } else {
        activeProductsWithoutSellableInventory++
        unsellableInventoryProducts.push(product)
      }
    }
  }

  return {
    activeProductCount: products.length,
    activePurchasableProductCount,
    activeProductsWithValidPrice,
    activePurchasableProductsWithValidPrice,
    activeProductsMissingValidPrice,
    activeProductsWithInventory,
    activeProductsSellableOnBackorder,
    activeProductsInventoryReady,
    activeProductsWithoutSellableInventory,
    activeComingSoonProductCount,
    activePresaleProductCount,
    activePresaleNotSellableProductCount,
    activePhysicalProductsMissingWeight,
    activeProductsWithMedia,
    samples: {
      missingPrice: sampleOf(missingPriceProducts),
      missingWeight: sampleOf(missingWeightProducts),
      unsellableInventory: sampleOf(unsellableInventoryProducts),
      comingSoon: sampleOf(comingSoonProducts),
      presaleNotSellable: sampleOf(presaleNotSellableProducts),
    },
  }
}

import { randomUUID } from 'node:crypto'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { emitInternalEvent } from '@/server/events/dispatcher'
import {
  getAvailabilityMessage,
  getProductAvailabilityBadge,
  resolveEffectiveSalesMode,
} from '@/server/services/product-availability.service'
import type {
  ProductFulfillmentType,
  ProductSalesMode,
  ProductStatus,
  Prisma,
} from '@prisma/client'

const productInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  media: {
    include: { asset: true },
    orderBy: { position: 'asc' as const },
  },
  options: {
    include: { values: { orderBy: { position: 'asc' as const } } },
    orderBy: { position: 'asc' as const },
  },
} satisfies Prisma.ProductInclude

// Lightweight select for product list — no options, only featured media, minimal variant fields.
const productSummarySelect = {
  id: true,
  title: true,
  handle: true,
  status: true,
  salesMode: true,
  presaleStartsAt: true,
  presaleEndsAt: true,
  availableForPurchaseAt: true,
  expectedDeliveryText: true,
  availabilityMessage: true,
  storefrontBadgeText: true,
  fulfillmentType: true,
  vendor: true,
  productType: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  variants: {
    select: {
      id: true,
      priceCents: true,
      compareAtPriceCents: true,
      sku: true,
      inventory: true,
      continueSellingWhenOutOfStock: true,
    },
    orderBy: { position: 'asc' as const },
  },
  media: {
    select: {
      id: true,
      isFeatured: true,
      position: true,
      assetId: true,
      asset: {
        select: { id: true, altText: true },
      },
    },
    take: 1,
    orderBy: [
      { isFeatured: 'desc' as const },
      { position: 'asc' as const },
      { id: 'asc' as const },
    ],
  },
} satisfies Prisma.ProductSelect

const storefrontProductInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  media: { include: { asset: true }, orderBy: { position: 'asc' as const }, take: 2 },
} satisfies Prisma.ProductInclude

type ProductVariantPayload = {
  id?: string
  title: string
  sku?: string
  priceCents: number
  compareAtPriceCents?: number
  inventory?: number
  continueSellingWhenOutOfStock?: boolean
  weight?: number
  weightUnit?: string
  position?: number
}

type ProductMediaPayload = {
  assetId: string
  position?: number
  isFeatured?: boolean
}

function attachMediaUrls(product: any) {
  return {
    ...product,
    variants: (product.variants || []).map((variant: any) => ({
      ...variant,
      price: centsToDollars(variant.priceCents),
      compareAtPrice:
        variant.compareAtPriceCents == null ? null : centsToDollars(variant.compareAtPriceCents),
      continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
    })),
    media: (product.media || []).map((media: any) => ({
      ...media,
      asset: media.asset
        ? {
            ...media.asset,
            url: `/api/media/${media.asset.id}`,
          }
        : null,
    })),
  }
}

function attachMediaUrlsToList(products: any[] = []) {
  return products.map(attachMediaUrls)
}

function mapStorefrontAvailability(product: any) {
  const variants = product.variants || []
  const badge = getProductAvailabilityBadge({
    product,
    variants,
  })
  const message = getAvailabilityMessage({
    product,
    badge,
  })
  const effectiveSalesMode = resolveEffectiveSalesMode(product)

  return {
    salesMode: product.salesMode ?? 'STANDARD',
    effectiveSalesMode,
    availabilityMessage: message,
    expectedDeliveryText: product.expectedDeliveryText ?? null,
    storefrontBadgeText: product.storefrontBadgeText ?? null,
    fulfillmentType: product.fulfillmentType ?? 'PHYSICAL',
    badge,
  }
}

export function toStorefrontProduct(product: any) {
  const availability = mapStorefrontAvailability(product)

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    vendor: product.vendor,
    productType: product.productType,
    publishedAt: product.publishedAt,
    availability,
    media: (product.media || []).map((media: any) => ({
      id: media.id,
      position: media.position,
      isFeatured: media.isFeatured,
      url: media.asset?.url || null,
      altText: media.asset?.altText || null,
      width: media.asset?.width || null,
      height: media.asset?.height || null,
    })),
    options: (product.options || []).map((option: any) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: (option.values || []).map((value: any) => ({
        id: value.id,
        value: value.value,
        position: value.position,
      })),
    })),
    variants: (product.variants || []).map((variant: any) => ({
      id: variant.id,
      title: variant.title,
      price: centsToDollars(variant.priceCents),
      compareAtPrice:
        variant.compareAtPriceCents == null ? null : centsToDollars(variant.compareAtPriceCents),
      inventory: variant.inventory,
      continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
      weight: variant.weight,
      weightUnit: variant.weightUnit,
    })),
  }
}

function normalizeProductMedia(media: ProductMediaPayload[] = []) {
  const seenAssetIds = new Set<string>()

  return media.reduce<ProductMediaPayload[]>((items, mediaItem, index) => {
    const assetId = String(mediaItem?.assetId ?? '').trim()
    if (!assetId || seenAssetIds.has(assetId)) {
      return items
    }

    seenAssetIds.add(assetId)
    items.push({
      assetId,
      position: mediaItem.position ?? index,
      isFeatured: Boolean(mediaItem.isFeatured),
    })
    return items
  }, [])
}

function createFallbackVariant(variant?: Partial<ProductVariantPayload>): ProductVariantPayload {
  return {
    title: variant?.title || 'Default',
    sku: variant?.sku,
    priceCents: variant?.priceCents ?? 0,
    compareAtPriceCents: variant?.compareAtPriceCents,
    inventory: variant?.inventory ?? 0,
    continueSellingWhenOutOfStock: Boolean(variant?.continueSellingWhenOutOfStock),
    weight: variant?.weight,
    weightUnit: variant?.weightUnit ?? 'kg',
    position: variant?.position ?? 0,
  }
}

async function ensureUniqueHandle(baseHandle: string, excludeProductId?: string) {
  const sanitizedBase = baseHandle || `product-${randomUUID().slice(0, 8)}`
  let candidate = sanitizedBase
  let suffix = 2

  while (true) {
    const existing = await prisma.product.findUnique({
      where: { handle: candidate },
      select: { id: true },
    })

    if (!existing || existing.id === excludeProductId) {
      return candidate
    }

    candidate = `${sanitizedBase}-${suffix}`
    suffix += 1
  }
}

function getStorefrontPublishWindowWhere(now = new Date()): Prisma.ProductWhereInput {
  return {
    OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  }
}

async function syncProductVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: ProductVariantPayload[]
) {
  const existingVariants = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true },
  })

  const existingVariantIds = new Set(existingVariants.map((variant) => variant.id))
  const incomingExistingIds = new Set(
    variants
      .map((variant) => variant.id)
      .filter((variantId): variantId is string => Boolean(variantId && existingVariantIds.has(variantId)))
  )

  for (const [index, variant] of variants.entries()) {
    const variantData = {
      title: variant.title,
      sku: variant.sku,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents ?? null,
      inventory: variant.inventory ?? 0,
      continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
      weight: variant.weight ?? null,
      weightUnit: variant.weightUnit ?? 'kg',
      position: variant.position ?? index,
    }

    if (variant.id && existingVariantIds.has(variant.id)) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: variantData,
      })
      continue
    }

    await tx.productVariant.create({
      data: {
        productId,
        ...variantData,
      },
    })
  }

  const removableVariantIds = existingVariants
    .map((variant) => variant.id)
    .filter((variantId) => !incomingExistingIds.has(variantId))

  if (removableVariantIds.length) {
    await tx.productVariant.deleteMany({
      where: {
        productId,
        id: { in: removableVariantIds },
      },
    })
  }
}

async function syncProductMedia(
  tx: Prisma.TransactionClient,
  productId: string,
  media: ProductMediaPayload[]
) {
  const normalizedMedia = normalizeProductMedia(media)

  if (normalizedMedia.length) {
    const assetIds = normalizedMedia.map((mediaItem) => mediaItem.assetId)
    const assets = await tx.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true },
    })

    if (assets.length !== assetIds.length) {
      throw new Error('One or more media assets could not be found')
    }
  }

  await tx.productMedia.deleteMany({
    where: { productId },
  })

  if (!normalizedMedia.length) {
    return
  }

  const featuredAssetId =
    normalizedMedia.find((mediaItem) => mediaItem.isFeatured)?.assetId || normalizedMedia[0].assetId

  await tx.productMedia.createMany({
    data: normalizedMedia.map((mediaItem, index) => ({
      productId,
      assetId: mediaItem.assetId,
      position: mediaItem.position ?? index,
      isFeatured: mediaItem.assetId === featuredAssetId,
    })),
  })
}

export async function getProducts(params: {
  status?: ProductStatus
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const { status, search, page = 1, pageSize = 20, sortBy = 'createdAt', sortDir = 'desc' } = params

  const where: Prisma.ProductWhereInput = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ],
    }),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return {
    products: attachMediaUrlsToList(products),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

// Maps the lightweight summary select result to the public API shape.
// Variants have price in dollars, media is one deterministic item (featured-first, then position), options is always [].
function toProductSummaryResponse(product: any) {
  const featuredMedia = product.media?.[0] ?? null
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    salesMode: product.salesMode ?? 'STANDARD',
    presaleStartsAt: product.presaleStartsAt ?? null,
    presaleEndsAt: product.presaleEndsAt ?? null,
    availableForPurchaseAt: product.availableForPurchaseAt ?? null,
    expectedDeliveryText: product.expectedDeliveryText ?? null,
    availabilityMessage: product.availabilityMessage ?? null,
    storefrontBadgeText: product.storefrontBadgeText ?? null,
    fulfillmentType: product.fulfillmentType ?? 'PHYSICAL',
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    tags: product.tags ?? [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    publishedAt: product.publishedAt ?? null,
    variants: (product.variants || []).map((v: any) => ({
      id: v.id,
      price: centsToDollars(v.priceCents),
      compareAtPrice: v.compareAtPriceCents == null ? null : centsToDollars(v.compareAtPriceCents),
      sku: v.sku ?? null,
      inventory: v.inventory ?? 0,
      continueSellingWhenOutOfStock: Boolean(v.continueSellingWhenOutOfStock),
    })),
    media: featuredMedia
      ? [
          {
            id: featuredMedia.id,
            isFeatured: Boolean(featuredMedia.isFeatured),
            position: featuredMedia.position ?? 0,
            assetId: featuredMedia.assetId,
            asset: featuredMedia.asset
              ? {
                  id: featuredMedia.asset.id,
                  url: `/api/media/${featuredMedia.asset.id}`,
                  altText: featuredMedia.asset.altText ?? null,
                }
              : null,
          },
        ]
      : [],
    options: [],
  }
}

export async function getProductSummaries(params: {
  status?: ProductStatus
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const { status, search, page = 1, pageSize = 20, sortBy = 'createdAt', sortDir = 'desc' } = params

  const where: Prisma.ProductWhereInput = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ],
    }),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productSummarySelect,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return {
    products: products.map(toProductSummaryResponse),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  })

  return product ? attachMediaUrls(product) : null
}

export async function getStorefrontProductByHandle(handle: string) {
  const now = new Date()
  const product = await prisma.product.findFirst({
    where: {
      handle,
      status: 'ACTIVE',
      ...getStorefrontPublishWindowWhere(now),
    },
    include: productInclude,
  })

  return product ? toStorefrontProduct(attachMediaUrls(product)) : null
}

export async function createProduct(data: {
  title: string
  handle?: string
  status?: ProductStatus
  publishedAt?: Date | null
  salesMode?: ProductSalesMode
  presaleStartsAt?: Date | null
  presaleEndsAt?: Date | null
  availableForPurchaseAt?: Date | null
  expectedDeliveryText?: string
  availabilityMessage?: string
  storefrontBadgeText?: string
  fulfillmentType?: ProductFulfillmentType
  description?: string
  vendor?: string
  productType?: string
  tags?: string[]
  variants?: Array<{
    title: string
    sku?: string
    priceCents: number
    compareAtPriceCents?: number
    inventory?: number
    continueSellingWhenOutOfStock?: boolean
    weight?: number
    weightUnit?: string
    position?: number
  }>
  media?: ProductMediaPayload[]
}): Promise<{ product: any; mediaSyncError?: string }> {
  const handle = await ensureUniqueHandle(data.handle ?? slugify(data.title))
  const variants = data.variants?.length ? data.variants : [createFallbackVariant()]

  // Step 1: Create base product and variants atomically. Media sync is intentionally
  // excluded from this transaction so that invalid or missing asset IDs do not roll
  // back the base product create.
  const coreProduct = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        title: data.title,
        handle,
        status: data.status ?? 'DRAFT',
        publishedAt: data.publishedAt ?? null,
        salesMode: data.salesMode ?? 'STANDARD',
        presaleStartsAt: data.presaleStartsAt ?? null,
        presaleEndsAt: data.presaleEndsAt ?? null,
        availableForPurchaseAt: data.availableForPurchaseAt ?? null,
        expectedDeliveryText: data.expectedDeliveryText?.trim() || null,
        availabilityMessage: data.availabilityMessage?.trim() || null,
        storefrontBadgeText: data.storefrontBadgeText?.trim() || null,
        fulfillmentType: data.fulfillmentType ?? 'PHYSICAL',
        description: data.description,
        vendor: data.vendor,
        productType: data.productType,
        tags: data.tags ?? [],
        variants: {
          create: variants.map((variant, index) => ({
            title: variant.title,
            sku: variant.sku,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            inventory: variant.inventory ?? 0,
            continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
            weight: variant.weight,
            weightUnit: variant.weightUnit,
            position: variant.position ?? index,
          })),
        },
      },
      select: { id: true },
    })

    return tx.product.findUnique({
      where: { id: createdProduct.id },
      include: productInclude,
    })
  })

  if (!coreProduct) {
    return { product: null }
  }

  // Step 2: Attempt media sync outside the core transaction. A failure here preserves
  // the already-committed product; the caller receives mediaSyncError and can downgrade
  // status or surface a warning to the user.
  let mediaSyncError: string | undefined
  const hasMedia = Array.isArray(data.media) && data.media.length > 0
  if (hasMedia) {
    try {
      await prisma.$transaction(async (tx) => {
        await syncProductMedia(tx, coreProduct.id, data.media!)
      })
    } catch (e) {
      console.error(`[createProduct] media sync failed for product ${coreProduct.id}:`, e)
      mediaSyncError = e instanceof Error ? e.message : 'Media sync failed'
    }
  }

  // Step 3: Re-fetch with all relations so media rows are reflected in the response.
  const finalRecord = mediaSyncError
    ? coreProduct
    : await prisma.product.findUnique({ where: { id: coreProduct.id }, include: productInclude })

  const hydratedProduct = finalRecord ? attachMediaUrls(finalRecord) : null

  if (hydratedProduct) {
    await emitInternalEvent('product.created', {
      productId: hydratedProduct.id,
      handle: hydratedProduct.handle,
      title: hydratedProduct.title,
      status: hydratedProduct.status,
    })
  }

  return { product: hydratedProduct, mediaSyncError }
}

export async function updateProduct(
  id: string,
  data: Partial<{
    title: string
    handle: string
    status: ProductStatus
    publishedAt: Date | null
    salesMode: ProductSalesMode
    presaleStartsAt: Date | null
    presaleEndsAt: Date | null
    availableForPurchaseAt: Date | null
    expectedDeliveryText: string | null
    availabilityMessage: string | null
    storefrontBadgeText: string | null
    fulfillmentType: ProductFulfillmentType
    description: string
    vendor: string
    productType: string
    tags: string[]
    variants: ProductVariantPayload[]
    media: ProductMediaPayload[]
  }>
) {
  const { variants, media, ...productFields } = data
  const nextProductFields = { ...productFields }

  if (typeof nextProductFields.handle === 'string') {
    nextProductFields.handle = await ensureUniqueHandle(slugify(nextProductFields.handle), id)
  }

  if (Object.prototype.hasOwnProperty.call(nextProductFields, 'expectedDeliveryText')) {
    nextProductFields.expectedDeliveryText = nextProductFields.expectedDeliveryText?.trim() || null
  }

  if (Object.prototype.hasOwnProperty.call(nextProductFields, 'availabilityMessage')) {
    nextProductFields.availabilityMessage = nextProductFields.availabilityMessage?.trim() || null
  }

  if (Object.prototype.hasOwnProperty.call(nextProductFields, 'storefrontBadgeText')) {
    nextProductFields.storefrontBadgeText = nextProductFields.storefrontBadgeText?.trim() || null
  }

  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: nextProductFields,
    })

    if (variants) {
      await syncProductVariants(tx, id, variants.length ? variants : [createFallbackVariant()])
    }

    if (media) {
      await syncProductMedia(tx, id, media)
    }

    return tx.product.findUnique({
      where: { id },
      include: productInclude,
    })
  })

  const hydratedProduct = product ? attachMediaUrls(product) : null

  if (hydratedProduct) {
    await emitInternalEvent('product.updated', {
      productId: hydratedProduct.id,
      handle: hydratedProduct.handle,
      title: hydratedProduct.title,
      status: hydratedProduct.status,
    })
  }

  return hydratedProduct
}

export async function duplicateProduct(id: string) {
  const source = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  })

  if (!source) {
    return null
  }

  const duplicatedTitle = `${source.title} copy`
  const duplicatedHandle = await ensureUniqueHandle(slugify(`${source.handle}-copy`))
  const sourceVariants = source.variants?.length
    ? source.variants
    : [createFallbackVariant()]

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        title: duplicatedTitle,
        handle: duplicatedHandle,
        status: 'DRAFT',
        publishedAt: null,
        salesMode: source.salesMode,
        presaleStartsAt: source.presaleStartsAt,
        presaleEndsAt: source.presaleEndsAt,
        availableForPurchaseAt: source.availableForPurchaseAt,
        expectedDeliveryText: source.expectedDeliveryText,
        availabilityMessage: source.availabilityMessage,
        storefrontBadgeText: source.storefrontBadgeText,
        fulfillmentType: source.fulfillmentType,
        description: source.description,
        vendor: source.vendor,
        productType: source.productType,
        tags: source.tags,
        variants: {
          create: sourceVariants.map((variant, index) => ({
            title: variant.title,
            sku: null,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            inventory: variant.inventory,
            continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
            weight: variant.weight,
            weightUnit: variant.weightUnit,
            position: variant.position ?? index,
          })),
        },
        options: {
          create: (source.options || []).map((option, optionIndex) => ({
            name: option.name,
            position: option.position ?? optionIndex,
            values: {
              create: (option.values || []).map((value, valueIndex) => ({
                value: value.value,
                position: value.position ?? valueIndex,
              })),
            },
          })),
        },
      },
      select: { id: true },
    })

    if (source.media?.length) {
      await syncProductMedia(
        tx,
        createdProduct.id,
        source.media.map((mediaItem) => ({
          assetId: mediaItem.assetId,
          position: mediaItem.position,
          isFeatured: mediaItem.isFeatured,
        }))
      )
    }

    return tx.product.findUnique({
      where: { id: createdProduct.id },
      include: productInclude,
    })
  })

  const hydratedProduct = product ? attachMediaUrls(product) : null

  if (hydratedProduct) {
    await emitInternalEvent('product.created', {
      productId: hydratedProduct.id,
      handle: hydratedProduct.handle,
      title: hydratedProduct.title,
      status: hydratedProduct.status,
    })
  }

  return hydratedProduct
}

export async function updateVariant(
  id: string,
  data: Partial<{
    title: string
    sku: string
    priceCents: number
    compareAtPriceCents: number
    inventory: number
    continueSellingWhenOutOfStock: boolean
    weight: number
    weightUnit: string
  }>
) {
  return prisma.productVariant.update({ where: { id }, data })
}

export async function createVariant(
  productId: string,
  data: {
    title: string
    sku?: string
    priceCents: number
    compareAtPriceCents?: number
    inventory?: number
    continueSellingWhenOutOfStock?: boolean
    weight?: number
    weightUnit?: string
  }
) {
  const count = await prisma.productVariant.count({ where: { productId } })
  return prisma.productVariant.create({
    data: {
      productId,
      title: data.title,
      sku: data.sku,
      priceCents: data.priceCents,
      compareAtPriceCents: data.compareAtPriceCents,
      inventory: data.inventory ?? 0,
      continueSellingWhenOutOfStock: Boolean(data.continueSellingWhenOutOfStock),
      weight: data.weight,
      weightUnit: data.weightUnit,
      position: count,
    },
  })
}

export async function deleteVariant(id: string) {
  return prisma.productVariant.delete({ where: { id } })
}

export async function upsertOptions(
  productId: string,
  options: Array<{
    name: string
    position?: number
    values: Array<{ value: string; position?: number }>
  }>
) {
  const product = await prisma.$transaction(async (tx) => {
    await tx.productOption.deleteMany({ where: { productId } })

    for (const [index, option] of options.entries()) {
      await tx.productOption.create({
        data: {
          productId,
          name: option.name,
          position: option.position ?? index,
          values: {
            create: option.values.map((value, valueIndex) => ({
              value: value.value,
              position: value.position ?? valueIndex,
            })),
          },
        },
      })
    }

    return tx.product.findUnique({
      where: { id: productId },
      include: productInclude,
    })
  })

  const hydratedProduct = product ? attachMediaUrls(product) : null

  if (hydratedProduct) {
    await emitInternalEvent('product.updated', {
      productId: hydratedProduct.id,
      handle: hydratedProduct.handle,
      title: hydratedProduct.title,
      status: hydratedProduct.status,
    })
  }

  return hydratedProduct
}

export async function decrementInventory(variantId: string, quantity: number) {
  const updated = await prisma.productVariant.updateMany({
    where: {
      id: variantId,
      OR: [{ continueSellingWhenOutOfStock: true }, { inventory: { gte: quantity } }],
    },
    data: { inventory: { decrement: quantity } },
  })

  if (updated.count === 0) {
    throw new Error(`Insufficient inventory for variant ${variantId}`)
  }

  return updated
}

export async function archiveProduct(id: string) {
  const product = await prisma.product.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  })

  await emitInternalEvent('product.updated', {
    productId: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status,
  })

  return product
}

export async function getStorefrontProducts(params: {
  collectionHandle?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const { collectionHandle, search, page = 1, pageSize = 24 } = params
  const now = new Date()
  const searchFilter = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : null

  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    AND: [getStorefrontPublishWindowWhere(now), ...(searchFilter ? [searchFilter] : [])],
    ...(collectionHandle && {
      collections: {
        some: {
          collection: {
            handle: collectionHandle,
          },
        },
      },
    }),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: storefrontProductInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return {
    products: attachMediaUrlsToList(products).map(toStorefrontProduct),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return slug || `product-${randomUUID().slice(0, 8)}`
}

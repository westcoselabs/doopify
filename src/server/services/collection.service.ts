import { randomUUID } from 'node:crypto'
import { cache } from 'react'

import { centsToDollars, dollarsToCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import {
  getAvailabilityMessage,
  getProductAvailabilityBadge,
  resolveEffectiveSalesMode,
} from '@/server/services/product-availability.service'
import { Prisma } from '@prisma/client'
import { catalogMediaSelect, catalogPagination, storefrontVisibleProductWhere } from './catalog-read'

function storefrontVisibleCollectionWhere(now = new Date()): Prisma.CollectionWhereInput {
  return { isPublished: true, products: { some: { product: storefrontVisibleProductWhere(now) } } }
}

const collectionAdminSummarySelect = {
  id: true,
  title: true,
  handle: true,
  description: true,
  sortOrder: true,
  isPublished: true,
  updatedAt: true,
  _count: {
    select: {
      products: true,
    },
  },
} satisfies Prisma.CollectionSelect

const collectionAdminDetailInclude = {
  _count: {
    select: {
      products: true,
    },
  },
  products: {
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
          media: {
            include: {
              asset: { select: catalogMediaSelect },
            },
            orderBy: {
              position: 'asc' as const,
            },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.CollectionInclude

const storefrontCollectionSummarySelect = {
  id: true,
  title: true,
  handle: true,
  description: true,
  imageUrl: true,
  sortOrder: true,
  updatedAt: true,
  products: {
    orderBy: {
      position: 'asc' as const,
    },
    take: 1,
    select: {
      product: {
        select: {
          media: {
            include: {
              asset: { select: catalogMediaSelect },
            },
            orderBy: {
              position: 'asc' as const,
            },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.CollectionSelect

const storefrontCollectionDetailInclude = {
  products: {
    orderBy: {
      position: 'asc' as const,
    },
    include: {
      product: {
        select: {
          id: true,
          handle: true,
          title: true,
          description: true,
          vendor: true,
          productType: true,
          salesMode: true,
          presaleStartsAt: true,
          presaleEndsAt: true,
          availableForPurchaseAt: true,
          expectedDeliveryText: true,
          availabilityMessage: true,
          storefrontBadgeText: true,
          fulfillmentType: true,
          createdAt: true,
          media: {
            include: {
              asset: { select: catalogMediaSelect },
            },
            orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
            take: 2,
          },
          variants: {
            orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
            select: {
              id: true,
              title: true,
              priceCents: true,
              compareAtPriceCents: true,
              inventory: true,
              continueSellingWhenOutOfStock: true,
              weight: true,
              weightUnit: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CollectionInclude

const COLLECTION_SORT_OPTIONS = new Set([
  'MANUAL',
  'NEWEST',
  'TITLE_ASC',
  'PRICE_ASC',
  'PRICE_DESC',
])
const DEFAULT_COLLECTION_LIST_PAGE_SIZE = 25
const MAX_COLLECTION_LIST_PAGE_SIZE = 100

function clampPage(value?: number) {
  return Math.max(1, Math.floor(Number(value || 1)))
}

function clampCollectionListPageSize(value?: number) {
  return Math.max(
    1,
    Math.min(MAX_COLLECTION_LIST_PAGE_SIZE, Math.floor(Number(value || DEFAULT_COLLECTION_LIST_PAGE_SIZE)))
  )
}

function slugify(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return slug || `collection-${randomUUID().slice(0, 8)}`
}

async function ensureUniqueHandle(baseHandle: string, excludeCollectionId?: string) {
  const sanitizedBase = baseHandle || `collection-${randomUUID().slice(0, 8)}`
  let candidate = sanitizedBase
  let suffix = 2

  while (true) {
    const existing = await prisma.collection.findUnique({
      where: {
        handle: candidate,
      },
      select: {
        id: true,
      },
    })

    if (!existing || existing.id === excludeCollectionId) {
      return candidate
    }

    candidate = `${sanitizedBase}-${suffix}`
    suffix += 1
  }
}

function normalizeProductIds(productIds: string[] = []) {
  return Array.from(
    new Set(
      productIds
        .map((productId) => String(productId || '').trim())
        .filter(Boolean)
    )
  )
}

function normalizeSortOrder(sortOrder?: string) {
  const normalized = String(sortOrder || 'MANUAL')
    .trim()
    .toUpperCase()

  return COLLECTION_SORT_OPTIONS.has(normalized) ? normalized : 'MANUAL'
}

function mediaUrlFromProduct(product: any) {
  const assetId = product?.media?.[0]?.asset?.id
  return assetId ? `/api/media/${assetId}` : null
}

function toAdminCollectionSummary(collection: any) {
  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    sortOrder: collection.sortOrder,
    isPublished: collection.isPublished,
    updatedAt: collection.updatedAt,
    productCount: collection._count?.products ?? 0,
  }
}

function toAdminCollection(collection: any) {
  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    imageUrl: collection.imageUrl,
    sortOrder: collection.sortOrder,
    isAutomated: collection.isAutomated,
    isPublished: collection.isPublished,
    conditions: collection.conditions,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    productCount: collection._count?.products ?? collection.products?.length ?? 0,
    productIds: (collection.products || []).map((item: any) => item.productId),
    products: (collection.products || []).map((item: any) => ({
      id: item.product.id,
      title: item.product.title,
      handle: item.product.handle,
      status: item.product.status,
      vendor: item.product.vendor,
      imageUrl: mediaUrlFromProduct(item.product),
      position: item.position,
    })),
  }
}

function toStorefrontCollectionSummary(collection: any, productCount: number) {
  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    imageUrl: collection.imageUrl || mediaUrlFromProduct(collection.products?.[0]?.product) || null,
    sortOrder: collection.sortOrder,
    updatedAt: collection.updatedAt,
    productCount,
  }
}

function toStorefrontProduct(product: any) {
  const badge = getProductAvailabilityBadge({
    product,
    variants: product.variants || [],
  })

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    vendor: product.vendor,
    productType: product.productType,
    availability: {
      salesMode: product.salesMode ?? 'STANDARD',
      effectiveSalesMode: resolveEffectiveSalesMode(product),
      availabilityMessage: getAvailabilityMessage({ product, badge }),
      expectedDeliveryText: product.expectedDeliveryText ?? null,
      storefrontBadgeText: product.storefrontBadgeText ?? null,
      fulfillmentType: product.fulfillmentType ?? 'PHYSICAL',
      badge,
    },
    media: (product.media || []).map((media: any) => ({
      id: media.id,
      position: media.position,
      isFeatured: media.isFeatured,
      url: media.asset?.id ? `/api/media/${media.asset.id}` : null,
      altText: media.asset?.altText || null,
      width: media.asset?.width || null,
      height: media.asset?.height || null,
    })),
    variants: (product.variants || []).map((variant: any) => ({
      id: variant.id,
      title: variant.title,
      price: centsToDollars(
        variant.priceCents ?? dollarsToCents(variant.price ?? 0)
      ),
      compareAtPrice:
        variant.compareAtPriceCents == null
          ? variant.compareAtPrice == null
            ? null
            : Number(variant.compareAtPrice)
          : centsToDollars(variant.compareAtPriceCents),
      inventory: variant.inventory,
      continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
      weight: variant.weight,
      weightUnit: variant.weightUnit,
    })),
  }
}

async function getVisibleCollectionProductCounts(collectionIds: string[], now: Date) {
  if (!collectionIds.length) {
    return new Map<string, number>()
  }

  const counts = await prisma.collectionProduct.groupBy({
    by: ['collectionId'],
    where: {
      collectionId: {
        in: collectionIds,
      },
      product: storefrontVisibleProductWhere(now),
    },
    _count: {
      _all: true,
    },
  })

  return new Map(counts.map((entry) => [entry.collectionId, entry._count._all]))
}

async function syncCollectionProducts(
  tx: Prisma.TransactionClient,
  collectionId: string,
  productIds: string[]
) {
  const normalizedProductIds = normalizeProductIds(productIds)

  if (normalizedProductIds.length) {
    const products = await tx.product.findMany({
      where: {
        id: {
          in: normalizedProductIds,
        },
      },
      select: {
        id: true,
      },
    })

    if (products.length !== normalizedProductIds.length) {
      throw new Error('One or more products could not be found')
    }
  }

  await tx.collectionProduct.deleteMany({
    where: {
      collectionId,
    },
  })

  if (!normalizedProductIds.length) {
    return
  }

  await tx.collectionProduct.createMany({
    data: normalizedProductIds.map((productId, index) => ({
      collectionId,
      productId,
      position: index,
    })),
  })
}

export async function getCollectionSummaries(params: {
  search?: string
  page?: number
  pageSize?: number
} = {}) {
  const page = clampPage(params.page)
  const pageSize = clampCollectionListPageSize(params.pageSize)
  const where: Prisma.CollectionWhereInput = params.search
    ? {
        OR: [
          { title: { contains: params.search, mode: 'insensitive' } },
          { handle: { contains: params.search, mode: 'insensitive' } },
          { description: { contains: params.search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [collections, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: collectionAdminSummarySelect,
      orderBy: {
        updatedAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.collection.count({
      where,
    }),
  ])

  return {
    collections: collections.map(toAdminCollectionSummary),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getCollection(id: string) {
  const collection = await prisma.collection.findUnique({
    where: {
      id,
    },
    include: collectionAdminDetailInclude,
  })

  return collection ? toAdminCollection(collection) : null
}

export async function getCollectionIdentity(id: string) {
  return prisma.collection.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      handle: true,
    },
  })
}

export async function createCollection(data: {
  title: string
  handle?: string
  description?: string
  imageUrl?: string
  sortOrder?: string
  isPublished?: boolean
  productIds?: string[]
}) {
  const handle = await ensureUniqueHandle(slugify(data.handle || data.title))

  const collection = await prisma.$transaction(async (tx) => {
    const created = await tx.collection.create({
      data: {
        title: data.title,
        handle,
        description: data.description,
        imageUrl: data.imageUrl,
        sortOrder: normalizeSortOrder(data.sortOrder),
        isPublished: data.isPublished ?? true,
      },
      select: {
        id: true,
      },
    })

    if (data.productIds) {
      await syncCollectionProducts(tx, created.id, data.productIds)
    }

    return tx.collection.findUnique({
      where: {
        id: created.id,
      },
      include: collectionAdminDetailInclude,
    })
  })

  return collection ? toAdminCollection(collection) : null
}

export async function updateCollection(
  id: string,
  data: Partial<{
    title: string
    handle: string
    description: string
    imageUrl: string
    sortOrder: string
    isPublished: boolean
    productIds: string[]
  }>
) {
  const nextData: Prisma.CollectionUpdateInput = {}

  if (typeof data.title === 'string') {
    nextData.title = data.title
  }

  if (typeof data.handle === 'string') {
    nextData.handle = await ensureUniqueHandle(slugify(data.handle), id)
  }

  if (typeof data.description === 'string') {
    nextData.description = data.description || null
  }

  if (typeof data.imageUrl === 'string') {
    nextData.imageUrl = data.imageUrl || null
  }

  if (typeof data.sortOrder === 'string') {
    nextData.sortOrder = normalizeSortOrder(data.sortOrder)
  }

  if (typeof data.isPublished === 'boolean') {
    nextData.isPublished = data.isPublished
  }

  const collection = await prisma.$transaction(async (tx) => {
    await tx.collection.update({
      where: {
        id,
      },
      data: nextData,
    })

    if (data.productIds) {
      await syncCollectionProducts(tx, id, data.productIds)
    }

    return tx.collection.findUnique({
      where: {
        id,
      },
      include: collectionAdminDetailInclude,
    })
  })

  return collection ? toAdminCollection(collection) : null
}

export async function deleteCollection(id: string) {
  return prisma.collection.delete({
    where: {
      id,
    },
    select: {
      id: true,
      handle: true,
    },
  })
}

export async function getStorefrontCollectionSummaries(params: { page?: number; pageSize?: number; excludeHandle?: string } = {}) {
  const { page, pageSize } = catalogPagination(params)
  const now = new Date()
  const where: Prisma.CollectionWhereInput = {
    ...storefrontVisibleCollectionWhere(now),
    ...(params.excludeHandle ? { handle: { not: params.excludeHandle } } : {}),
  }
  const [collections, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: {
        ...storefrontCollectionSummarySelect,
        products: {
          ...storefrontCollectionSummarySelect.products,
          where: { product: storefrontVisibleProductWhere(now) },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.collection.count({ where }),
  ])
  const counts = await getVisibleCollectionProductCounts(collections.map((collection) => collection.id), now)
  return {
    collections: collections.map((collection) => toStorefrontCollectionSummary(collection, counts.get(collection.id) ?? 0)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export const getStorefrontCollectionMetadata = cache(async (handle: string) => {
  return prisma.collection.findFirst({
    where: { handle, ...storefrontVisibleCollectionWhere() },
    select: { id: true, title: true, handle: true, description: true, imageUrl: true, sortOrder: true },
  })
})

export async function getStorefrontCollectionByHandle(handle: string, params: { page?: number; pageSize?: number } = {}) {
  const collection = await getStorefrontCollectionMetadata(handle)
  if (!collection) return null
  const { page, pageSize } = catalogPagination(params)
  const now = new Date()
  const where: Prisma.CollectionProductWhereInput = { collectionId: collection.id, product: storefrontVisibleProductWhere(now) }
  const orderBy: Prisma.CollectionProductOrderByWithRelationInput[] = collection.sortOrder === 'NEWEST'
    ? [{ product: { createdAt: 'desc' } }, { productId: 'asc' }]
    : collection.sortOrder === 'TITLE_ASC'
      ? [{ product: { title: 'asc' } }, { productId: 'asc' }]
      : [{ position: 'asc' }, { productId: 'asc' }]

  async function loadPage() {
    if (collection!.sortOrder !== 'PRICE_ASC' && collection!.sortOrder !== 'PRICE_DESC') {
      return prisma.collectionProduct.findMany({ where, include: storefrontCollectionDetailInclude.products.include, orderBy, skip: (page - 1) * pageSize, take: pageSize })
    }
    // Match the established primary-variant price semantics, sorting before hydration.
    const direction = collection!.sortOrder === 'PRICE_DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`
    const ids = await prisma.$queryRaw<Array<{ productId: string }>>(Prisma.sql`
      SELECT cp."productId" FROM "collection_products" cp
      JOIN "products" p ON p."id" = cp."productId"
      LEFT JOIN LATERAL (
        SELECT v."priceCents" FROM "product_variants" v WHERE v."productId" = p."id"
        ORDER BY v."position" ASC, v."id" ASC LIMIT 1
      ) primary_variant ON TRUE
      WHERE cp."collectionId" = ${collection!.id} AND p."status" = 'ACTIVE'
        AND (p."publishedAt" IS NULL OR p."publishedAt" <= ${now})
      ORDER BY COALESCE(primary_variant."priceCents", 0) ${direction}, cp."productId" ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `)
    if (!ids.length) return []
    const rows = await prisma.collectionProduct.findMany({ where: { ...where, productId: { in: ids.map((row) => row.productId) } }, include: storefrontCollectionDetailInclude.products.include })
    const positions = new Map(ids.map((row, index) => [row.productId, index]))
    return rows.sort((left, right) => positions.get(left.productId)! - positions.get(right.productId)!)
  }
  const [rows, total] = await Promise.all([loadPage(), prisma.collectionProduct.count({ where })])
  const products = rows.map((row) => toStorefrontProduct(row.product))
  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    description: collection.description,
    sortOrder: collection.sortOrder,
    imageUrl: collection.imageUrl || products[0]?.media?.[0]?.url || null,
    productCount: total,
    products,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

import { prisma } from '@/lib/prisma'

export class DigitalAssetServiceError extends Error {
  code: 'STORE_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'ASSET_NOT_FOUND'
  status: number

  constructor(
    code: 'STORE_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'ASSET_NOT_FOUND',
    message: string,
    status: number
  ) {
    super(message)
    this.code = code
    this.status = status
  }
}

export type CreateDigitalAssetMetadataInput = {
  title: string
  fileName: string
  contentType: string
  byteSize: number
  storageProvider: string
  storageKey: string
  checksumSha256?: string | null
}

const digitalAssetAdminSelect = {
  id: true,
  storeId: true,
  title: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  storageProvider: true,
  checksumSha256: true,
  createdAt: true,
  updatedAt: true,
} as const

const productDigitalAssetSelect = {
  id: true,
  productId: true,
  digitalAssetId: true,
  sortOrder: true,
  createdAt: true,
  digitalAsset: {
    select: digitalAssetAdminSelect,
  },
} as const

async function ensureStoreExists(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  })

  if (!store) {
    throw new DigitalAssetServiceError('STORE_NOT_FOUND', 'Store not found', 404)
  }
}

async function ensureProductExists(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })

  if (!product) {
    throw new DigitalAssetServiceError('PRODUCT_NOT_FOUND', 'Product not found', 404)
  }
}

async function ensureStoreScopedAssetExists(storeId: string, assetId: string) {
  const asset = await prisma.digitalAsset.findFirst({
    where: {
      id: assetId,
      storeId,
    },
    select: { id: true },
  })

  if (!asset) {
    throw new DigitalAssetServiceError('ASSET_NOT_FOUND', 'Digital asset not found for store', 404)
  }
}

export async function listDigitalAssetsForStore(storeId: string) {
  await ensureStoreExists(storeId)

  return prisma.digitalAsset.findMany({
    where: { storeId },
    orderBy: [{ createdAt: 'desc' }],
    select: digitalAssetAdminSelect,
  })
}

export async function getDigitalAssetForStore(storeId: string, assetId: string) {
  const asset = await prisma.digitalAsset.findFirst({
    where: {
      id: assetId,
      storeId,
    },
    select: digitalAssetAdminSelect,
  })

  if (!asset) {
    throw new DigitalAssetServiceError('ASSET_NOT_FOUND', 'Digital asset not found for store', 404)
  }

  return asset
}

export async function createDigitalAssetMetadata(
  storeId: string,
  input: CreateDigitalAssetMetadataInput
) {
  await ensureStoreExists(storeId)

  return prisma.digitalAsset.create({
    data: {
      storeId,
      title: input.title.trim(),
      fileName: input.fileName.trim(),
      contentType: input.contentType.trim(),
      byteSize: input.byteSize,
      storageProvider: input.storageProvider.trim(),
      storageKey: input.storageKey.trim(),
      checksumSha256: input.checksumSha256?.trim() || null,
    },
    select: digitalAssetAdminSelect,
  })
}

export async function listProductDigitalAssets(storeId: string, productId: string) {
  await ensureProductExists(productId)

  return prisma.productDigitalAsset.findMany({
    where: {
      productId,
      digitalAsset: {
        storeId,
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: productDigitalAssetSelect,
  })
}

export async function linkDigitalAssetToProduct(
  storeId: string,
  productId: string,
  digitalAssetId: string,
  sortOrder?: number
) {
  await ensureProductExists(productId)
  await ensureStoreScopedAssetExists(storeId, digitalAssetId)

  const existing = await prisma.productDigitalAsset.findUnique({
    where: {
      productId_digitalAssetId: {
        productId,
        digitalAssetId,
      },
    },
    select: productDigitalAssetSelect,
  })

  if (existing && sortOrder === undefined) {
    return existing
  }

  if (existing && sortOrder !== undefined) {
    return prisma.productDigitalAsset.update({
      where: { id: existing.id },
      data: { sortOrder: Math.max(0, Math.floor(sortOrder)) },
      select: productDigitalAssetSelect,
    })
  }

  const highestSortOrder = await prisma.productDigitalAsset.findFirst({
    where: { productId },
    orderBy: [{ sortOrder: 'desc' }],
    select: { sortOrder: true },
  })
  const nextSortOrder =
    sortOrder === undefined
      ? (highestSortOrder?.sortOrder ?? -1) + 1
      : Math.max(0, Math.floor(sortOrder))

  return prisma.productDigitalAsset.create({
    data: {
      productId,
      digitalAssetId,
      sortOrder: nextSortOrder,
    },
    select: productDigitalAssetSelect,
  })
}

export async function unlinkDigitalAssetFromProduct(
  storeId: string,
  productId: string,
  digitalAssetId: string
) {
  await ensureProductExists(productId)
  await ensureStoreScopedAssetExists(storeId, digitalAssetId)

  const result = await prisma.productDigitalAsset.deleteMany({
    where: {
      productId,
      digitalAssetId,
    },
  })

  return { removed: result.count > 0 }
}

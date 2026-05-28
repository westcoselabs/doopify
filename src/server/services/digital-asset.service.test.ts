import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: { findUnique: vi.fn() },
    product: { findUnique: vi.fn() },
    digitalAsset: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    productDigitalAsset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import {
  createDigitalAssetMetadata,
  linkDigitalAssetToProduct,
  listProductDigitalAssets,
  unlinkDigitalAssetFromProduct,
} from './digital-asset.service'

describe('digital-asset.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.store.findUnique.mockResolvedValue({ id: 'store_1' })
    mocks.prisma.product.findUnique.mockResolvedValue({ id: 'prod_1' })
    mocks.prisma.digitalAsset.findFirst.mockResolvedValue({ id: 'asset_1' })
  })

  it('creates asset metadata', async () => {
    mocks.prisma.digitalAsset.create.mockResolvedValue({
      id: 'asset_1',
      storeId: 'store_1',
      title: 'Ebook PDF',
      fileName: 'ebook.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      storageProvider: 's3',
      checksumSha256: null,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt: new Date('2026-05-27T00:00:00.000Z'),
    })

    const result = await createDigitalAssetMetadata('store_1', {
      title: 'Ebook PDF',
      fileName: 'ebook.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      storageProvider: 's3',
      storageKey: 'private/ebook.pdf',
    })

    expect(mocks.prisma.digitalAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 'store_1',
          storageKey: 'private/ebook.pdf',
        }),
      })
    )
    expect(result.id).toBe('asset_1')
  })

  it('rejects cross-store access when linking an asset from another store', async () => {
    mocks.prisma.digitalAsset.findFirst.mockResolvedValue(null)

    await expect(linkDigitalAssetToProduct('store_1', 'prod_1', 'asset_2')).rejects.toThrow(
      'Digital asset not found for store'
    )
    expect(mocks.prisma.productDigitalAsset.create).not.toHaveBeenCalled()
  })

  it('links asset to product', async () => {
    mocks.prisma.productDigitalAsset.findUnique.mockResolvedValue(null)
    mocks.prisma.productDigitalAsset.findFirst.mockResolvedValue({ sortOrder: 1 })
    mocks.prisma.productDigitalAsset.create.mockResolvedValue({
      id: 'pda_1',
      productId: 'prod_1',
      digitalAssetId: 'asset_1',
      sortOrder: 2,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      digitalAsset: { id: 'asset_1' },
    })

    const result = await linkDigitalAssetToProduct('store_1', 'prod_1', 'asset_1')
    expect(mocks.prisma.productDigitalAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'prod_1',
          digitalAssetId: 'asset_1',
          sortOrder: 2,
        }),
      })
    )
    expect(result.id).toBe('pda_1')
  })

  it('treats duplicate link as idempotent when no sortOrder is provided', async () => {
    mocks.prisma.productDigitalAsset.findUnique.mockResolvedValue({
      id: 'pda_existing',
      productId: 'prod_1',
      digitalAssetId: 'asset_1',
      sortOrder: 0,
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      digitalAsset: { id: 'asset_1' },
    })

    const result = await linkDigitalAssetToProduct('store_1', 'prod_1', 'asset_1')
    expect(result.id).toBe('pda_existing')
    expect(mocks.prisma.productDigitalAsset.create).not.toHaveBeenCalled()
    expect(mocks.prisma.productDigitalAsset.update).not.toHaveBeenCalled()
  })

  it('unlinking preserves asset metadata', async () => {
    mocks.prisma.productDigitalAsset.deleteMany.mockResolvedValue({ count: 1 })

    const result = await unlinkDigitalAssetFromProduct('store_1', 'prod_1', 'asset_1')
    expect(result).toEqual({ removed: true })
    expect(mocks.prisma.productDigitalAsset.deleteMany).toHaveBeenCalled()
    expect(mocks.prisma.digitalAsset.create).not.toHaveBeenCalled()
  })

  it('returns product-level asset list ordered by sortOrder then createdAt', async () => {
    mocks.prisma.productDigitalAsset.findMany.mockResolvedValue([
      { id: 'pda_1', sortOrder: 0, createdAt: new Date('2026-05-27T00:00:00.000Z') },
      { id: 'pda_2', sortOrder: 1, createdAt: new Date('2026-05-27T00:00:01.000Z') },
    ])

    const result = await listProductDigitalAssets('store_1', 'prod_1')

    expect(mocks.prisma.productDigitalAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
    )
    expect(result.map((item: { id: string }) => item.id)).toEqual(['pda_1', 'pda_2'])
  })
})

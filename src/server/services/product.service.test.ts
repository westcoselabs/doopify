import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    productMedia: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    mediaAsset: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  emitInternalEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

import {
  getStorefrontProductByHandle,
  getStorefrontProducts,
  getProductSummaries,
  getProduct,
  createProduct,
  updateProduct,
} from './product.service'

describe('getProductSummaries — lightweight list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with select (not include) so options and full media are excluded', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([])
    mocks.prisma.product.count.mockResolvedValue(0)

    await getProductSummaries({ page: 1, pageSize: 20 })

    const callArg = mocks.prisma.product.findMany.mock.calls[0][0]
    expect(callArg).toHaveProperty('select')
    expect(callArg).not.toHaveProperty('include')
    expect(callArg.select).not.toHaveProperty('options')
  })

  it('summary select includes variants and one deterministic media item', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([])
    mocks.prisma.product.count.mockResolvedValue(0)

    await getProductSummaries({ page: 1, pageSize: 20 })

    const select = mocks.prisma.product.findMany.mock.calls[0][0].select
    expect(select).toHaveProperty('variants')
    expect(select).toHaveProperty('media')
    expect(select.media).toMatchObject({ take: 1 })
    expect(select.media.orderBy).toEqual([
      { isFeatured: 'desc' },
      { position: 'asc' },
      { id: 'asc' },
    ])
  })

  it('converts variant priceCents to dollars and sets options: [] in the response', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        title: 'Test Product',
        handle: 'test-product',
        status: 'ACTIVE',
        vendor: null,
        productType: null,
        tags: [],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        publishedAt: null,
        variants: [
          { id: 'var-1', priceCents: 2999, compareAtPriceCents: null, sku: 'SKU-1', inventory: 5 },
        ],
        media: [],
      },
    ])
    mocks.prisma.product.count.mockResolvedValue(1)

    const result = await getProductSummaries({ page: 1, pageSize: 20 })

    expect(result.products).toHaveLength(1)
    expect(result.products[0].variants[0].price).toBe(29.99)
    expect(result.products[0].options).toEqual([])
    expect(result.products[0].media).toEqual([])
  })

  it('includes the computed media URL for the featured item', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-2',
        title: 'With Image',
        handle: 'with-image',
        status: 'ACTIVE',
        vendor: null,
        productType: null,
        tags: [],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        publishedAt: null,
        variants: [],
        media: [
          {
            id: 'media-1',
            isFeatured: true,
            position: 0,
            assetId: 'asset-1',
            asset: { id: 'asset-1', altText: 'A shirt' },
          },
        ],
      },
    ])
    mocks.prisma.product.count.mockResolvedValue(1)

    const result = await getProductSummaries({ page: 1, pageSize: 20 })

    const media = result.products[0].media[0]
    expect(media.asset?.url).toBe('/api/media/asset-1')
    expect(media.asset?.altText).toBe('A shirt')
  })

  it('keeps media mapping deterministic when no media rows exist', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-3',
        title: 'No Media',
        handle: 'no-media',
        status: 'ACTIVE',
        vendor: null,
        productType: null,
        tags: [],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        publishedAt: null,
        variants: [],
        media: [],
      },
    ])
    mocks.prisma.product.count.mockResolvedValue(1)

    const result = await getProductSummaries({ page: 1, pageSize: 20 })

    expect(result.products[0].media).toEqual([])
  })

  it('returns the selected summary media row from the same product', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-4',
        title: 'Deterministic',
        handle: 'deterministic',
        status: 'ACTIVE',
        vendor: null,
        productType: null,
        tags: [],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        publishedAt: null,
        variants: [],
        media: [
          {
            id: 'media-4',
            isFeatured: false,
            position: 2,
            assetId: 'asset-4',
            asset: { id: 'asset-4', altText: 'Deterministic image' },
          },
        ],
      },
    ])
    mocks.prisma.product.count.mockResolvedValue(1)

    const result = await getProductSummaries({ page: 1, pageSize: 20 })

    expect(result.products[0].id).toBe('prod-4')
    expect(result.products[0].media[0]).toMatchObject({
      id: 'media-4',
      assetId: 'asset-4',
      isFeatured: false,
      asset: {
        id: 'asset-4',
        url: '/api/media/asset-4',
      },
    })
  })
})

describe('getProduct — full detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches with full include so variants, media with assets, and options are all present', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(null)

    await getProduct('prod-1')

    const callArg = mocks.prisma.product.findUnique.mock.calls[0][0]
    expect(callArg).toHaveProperty('include')
    expect(callArg.include).toHaveProperty('variants')
    expect(callArg.include).toHaveProperty('media')
    expect(callArg.include).toHaveProperty('options')
  })
})

describe('createProduct — safe partial create', () => {
  const minimalProduct = {
    id: 'prod-1',
    title: 'Test',
    handle: 'test',
    status: 'DRAFT',
    publishedAt: null,
    description: null,
    vendor: null,
    productType: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [{ id: 'var-1', priceCents: 1000, compareAtPriceCents: null, sku: null, inventory: 0, title: 'Default', weight: null, weightUnit: 'kg', position: 0 }],
    media: [],
    options: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.emitInternalEvent.mockResolvedValue(undefined)
    mocks.prisma.product.create.mockResolvedValue({ id: 'prod-1' })
    // Route handle lookups (where.handle) return null (no conflict).
    // Product fetches (where.id) return minimalProduct.
    mocks.prisma.product.findUnique.mockImplementation(async ({ where }: any) => {
      if ('handle' in where) return null
      if (where.id === 'prod-1') return minimalProduct
      return null
    })
  })

  it('returns product when created with no media', async () => {
    mocks.prisma.$transaction
      .mockImplementationOnce(async (cb: any) => cb(mocks.prisma))

    const result = await createProduct({ title: 'Test', status: 'DRAFT' })

    expect(result.product).not.toBeNull()
    expect(result.product?.id).toBe('prod-1')
    expect(result.mediaSyncError).toBeUndefined()
  })

  it('returns product with mediaSyncError when media asset IDs are invalid', async () => {
    mocks.prisma.$transaction
      .mockImplementationOnce(async (cb: any) => cb(mocks.prisma))
      .mockImplementationOnce(async (_cb: any) => {
        throw new Error('One or more media assets could not be found')
      })

    const result = await createProduct({
      title: 'Test',
      status: 'DRAFT',
      media: [{ assetId: 'nonexistent-asset' }],
    })

    expect(result.product).not.toBeNull()
    expect(result.product?.id).toBe('prod-1')
    expect(result.mediaSyncError).toContain('media assets could not be found')
  })

  it('still emits product.created even when media sync fails', async () => {
    mocks.prisma.$transaction
      .mockImplementationOnce(async (cb: any) => cb(mocks.prisma))
      .mockImplementationOnce(async (_cb: any) => {
        throw new Error('media error')
      })

    await createProduct({ title: 'Test', media: [{ assetId: 'bad-id' }] })

    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('product.created', expect.objectContaining({
      productId: 'prod-1',
    }))
  })
})

describe('product storefront visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters storefront list to active products that are publishable now', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([])
    mocks.prisma.product.count.mockResolvedValue(0)

    await getStorefrontProducts({ page: 1, pageSize: 24 })

    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          AND: expect.arrayContaining([
            { OR: [{ publishedAt: null }, { publishedAt: { lte: expect.any(Date) } }] },
          ]),
        }),
      })
    )
  })

  it('filters storefront detail lookup to active and publishable handle entries', async () => {
    mocks.prisma.product.findFirst.mockResolvedValue(null)

    await expect(getStorefrontProductByHandle('alpha')).resolves.toBeNull()

    expect(mocks.prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          handle: 'alpha',
          status: 'ACTIVE',
          OR: [{ publishedAt: null }, { publishedAt: { lte: expect.any(Date) } }],
        }),
      })
    )
  })

  it('returns structured variant optionValues for storefront detail DTO', async () => {
    mocks.prisma.product.findFirst.mockResolvedValue({
      id: 'prod-option-values',
      handle: 'prod-option-values',
      title: 'Structured Variant Product',
      description: 'desc',
      vendor: null,
      productType: null,
      publishedAt: new Date('2024-01-01'),
      status: 'ACTIVE',
      salesMode: 'STANDARD',
      presaleStartsAt: null,
      presaleEndsAt: null,
      availableForPurchaseAt: null,
      availabilityMessage: null,
      expectedDeliveryText: null,
      storefrontBadgeText: null,
      fulfillmentType: 'PHYSICAL',
      media: [],
      options: [
        {
          id: 'opt-size',
          name: 'Size',
          position: 0,
          values: [
            { id: 'val-size-sm', value: 'S/M', position: 0 },
            { id: 'val-size-l', value: 'L', position: 1 },
          ],
        },
        {
          id: 'opt-color',
          name: 'Color',
          position: 1,
          values: [
            { id: 'val-color-red', value: 'Red', position: 0 },
            { id: 'val-color-blue', value: 'Blue', position: 1 },
          ],
        },
      ],
      variants: [
        {
          id: 'var-1',
          title: 'S/M / Blue',
          priceCents: 3299,
          compareAtPriceCents: null,
          sku: 'SKU-BLUE',
          inventory: 5,
          continueSellingWhenOutOfStock: false,
          weight: 8,
          weightUnit: 'oz',
          position: 0,
        },
      ],
    })

    const product = await getStorefrontProductByHandle('prod-option-values')

    expect(product?.variants[0]?.optionValues).toEqual({
      Size: 'S/M',
      Color: 'Blue',
    })
  })
})

describe('updateProduct â€” variant weight sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.emitInternalEvent.mockResolvedValue(undefined)
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(mocks.prisma))
    mocks.prisma.product.update.mockResolvedValue({ id: 'prod-1' })
    mocks.prisma.productVariant.findMany.mockResolvedValue([{ id: 'var-1' }])
    mocks.prisma.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      title: 'Weighted Product',
      handle: 'weighted-product',
      status: 'DRAFT',
      publishedAt: null,
      description: null,
      vendor: null,
      productType: null,
      tags: [],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      variants: [
        {
          id: 'var-1',
          title: 'Default',
          priceCents: 1000,
          compareAtPriceCents: null,
          sku: 'WEIGHT-1',
          inventory: 0,
          continueSellingWhenOutOfStock: false,
          weight: 0,
          weightUnit: 'oz',
          position: 0,
        },
      ],
      media: [],
      options: [],
    })
  })

  it('persists zero weight and defaults cleared weight fields safely', async () => {
    await updateProduct('prod-1', {
      variants: [
        {
          id: 'var-1',
          title: 'Default',
          priceCents: 1000,
          compareAtPriceCents: undefined,
          inventory: 0,
          continueSellingWhenOutOfStock: false,
          weight: 0,
          weightUnit: 'oz',
          position: 0,
        },
        {
          title: 'Default 2',
          priceCents: 1200,
          compareAtPriceCents: undefined,
          inventory: 1,
          continueSellingWhenOutOfStock: false,
          weight: undefined,
          weightUnit: undefined,
          position: 1,
        },
      ],
    })

    expect(mocks.prisma.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'var-1' },
        data: expect.objectContaining({
          weight: 0,
          weightUnit: 'oz',
        }),
      })
    )

    expect(mocks.prisma.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          weight: null,
          weightUnit: 'kg',
        }),
      })
    )
  })
})

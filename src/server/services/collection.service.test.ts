import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    collection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    collectionProduct: {
      groupBy: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import {
  getCollectionSummaries,
  getStorefrontCollectionByHandle,
  getStorefrontCollectionSummaries,
} from './collection.service'

describe('collection service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps publish state visible to admin collection summaries', async () => {
    mocks.prisma.collection.findMany.mockResolvedValue([
      {
        id: 'col_1',
        title: 'Private Drop',
        handle: 'private-drop',
        description: 'Not public yet',
        sortOrder: 'MANUAL',
        isPublished: false,
        updatedAt: new Date('2026-04-26T00:00:00.000Z'),
        _count: {
          products: 2,
        },
      },
    ])
    mocks.prisma.collection.count.mockResolvedValue(1)

    await expect(getCollectionSummaries()).resolves.toEqual({
      collections: [
        {
          id: 'col_1',
          title: 'Private Drop',
          handle: 'private-drop',
          description: 'Not public yet',
          sortOrder: 'MANUAL',
          isPublished: false,
          updatedAt: new Date('2026-04-26T00:00:00.000Z'),
          productCount: 2,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
    })
  })

  it('caps admin collection list page size and keeps pagination metadata', async () => {
    mocks.prisma.collection.findMany.mockResolvedValue([])
    mocks.prisma.collection.count.mockResolvedValue(0)

    const result = await getCollectionSummaries({ page: 0, pageSize: 999 })

    expect(mocks.prisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      })
    )
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 100,
      total: 0,
      totalPages: 0,
    })
  })

  it('filters storefront collection summaries to published collections with visible products', async () => {
    mocks.prisma.collection.findMany.mockResolvedValue([
      {
        id: 'col_1',
        title: 'Featured',
        handle: 'featured',
        description: 'Public goods',
        imageUrl: null,
        sortOrder: 'MANUAL',
        updatedAt: new Date('2026-04-26T00:00:00.000Z'),
        products: [
          {
            product: {
              media: [
                {
                  asset: {
                    id: 'asset_1',
                  },
                },
              ],
            },
          },
        ],
        isPublished: true,
        internalNote: 'should not leak',
      },
    ])
    mocks.prisma.collectionProduct.groupBy.mockResolvedValue([
      {
        collectionId: 'col_1',
        _count: {
          _all: 3,
        },
      },
    ])

    const summaries = await getStorefrontCollectionSummaries()

    expect(mocks.prisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          products: expect.any(Object),
        }),
      })
    )
    expect(summaries).toEqual([
      {
        id: 'col_1',
        title: 'Featured',
        handle: 'featured',
        description: 'Public goods',
        imageUrl: '/api/media/asset_1',
        sortOrder: 'MANUAL',
        updatedAt: new Date('2026-04-26T00:00:00.000Z'),
        productCount: 3,
      },
    ])
    expect(summaries[0]).not.toHaveProperty('isPublished')
    expect(summaries[0]).not.toHaveProperty('internalNote')
  })

  it('requires storefront collection details to be published and storefront-visible', async () => {
    mocks.prisma.collection.findFirst.mockResolvedValue(null)

    await expect(getStorefrontCollectionByHandle('draft-drop')).resolves.toBeNull()
    expect(mocks.prisma.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          handle: 'draft-drop',
          isPublished: true,
          products: expect.any(Object),
        }),
      })
    )
  })

  it('returns storefront-safe collection detail DTOs without admin-only fields', async () => {
    mocks.prisma.collection.findFirst.mockResolvedValue({
      id: 'col_1',
      title: 'Featured',
      handle: 'featured',
      description: 'Public goods',
      imageUrl: null,
      sortOrder: 'MANUAL',
      isPublished: true,
      conditions: { hidden: true },
      products: [
        {
          position: 0,
          product: {
            id: 'prod_1',
            handle: 'alpha',
            title: 'Alpha',
            description: 'Alpha desc',
            vendor: 'Acme',
            productType: 'Shirt',
            status: 'ACTIVE',
            salesMode: 'STANDARD',
            presaleStartsAt: null,
            presaleEndsAt: null,
            availableForPurchaseAt: null,
            expectedDeliveryText: null,
            availabilityMessage: null,
            storefrontBadgeText: null,
            fulfillmentType: 'PHYSICAL',
            media: [
              {
                id: 'media_1',
                position: 0,
                isFeatured: true,
                asset: {
                  id: 'asset_1',
                  altText: 'Alpha',
                  width: 1200,
                  height: 1200,
                },
              },
            ],
            variants: [
              {
                id: 'var_1',
                title: 'Default',
                price: 25,
                compareAtPrice: null,
                inventory: 7,
                continueSellingWhenOutOfStock: false,
                weight: null,
                weightUnit: null,
              },
            ],
          },
        },
      ],
    })

    const detail = await getStorefrontCollectionByHandle('featured')

    expect(detail).toEqual({
      id: 'col_1',
      title: 'Featured',
      handle: 'featured',
      description: 'Public goods',
      imageUrl: '/api/media/asset_1',
      sortOrder: 'MANUAL',
      productCount: 1,
      products: [
        {
          id: 'prod_1',
          handle: 'alpha',
          title: 'Alpha',
          description: 'Alpha desc',
          vendor: 'Acme',
          productType: 'Shirt',
          availability: {
            salesMode: 'STANDARD',
            effectiveSalesMode: 'STANDARD',
            availabilityMessage: null,
            expectedDeliveryText: null,
            storefrontBadgeText: null,
            fulfillmentType: 'PHYSICAL',
            badge: null,
          },
          media: [
            {
              id: 'media_1',
              position: 0,
              isFeatured: true,
              url: '/api/media/asset_1',
              altText: 'Alpha',
              width: 1200,
              height: 1200,
            },
          ],
          variants: [
            {
              id: 'var_1',
              title: 'Default',
              price: 25,
              compareAtPrice: null,
              inventory: 7,
              continueSellingWhenOutOfStock: false,
              weight: null,
              weightUnit: null,
            },
          ],
        },
      ],
    })
    expect(detail).not.toHaveProperty('isPublished')
    expect(detail).not.toHaveProperty('conditions')
    expect(detail?.products[0]).not.toHaveProperty('status')
  })
})

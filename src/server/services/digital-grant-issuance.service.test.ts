import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
    digitalDownloadGrant: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
  getStoreSettingsLite: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

import { issueDigitalDownloadGrantsForPaidOrder } from './digital-grant-issuance.service'

function buildOrderFixture() {
  return {
    id: 'order_1',
    orderNumber: 1001,
    storeId: 'store_1',
    paymentStatus: 'PAID',
    items: [
      {
        id: 'item_1',
        productId: 'product_1',
        title: 'Digital Product',
        product: {
          id: 'product_1',
          fulfillmentType: 'DIGITAL',
          digitalAssets: [{ digitalAssetId: 'asset_1' }, { digitalAssetId: 'asset_2' }],
        },
      },
    ],
  }
}

describe('digital-grant-issuance.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.order.findUnique.mockResolvedValue(buildOrderFixture())
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([])
    mocks.prisma.digitalDownloadGrant.createMany.mockResolvedValue({ count: 0 })
    mocks.getStoreSettingsLite.mockResolvedValue({ id: 'store_1' })
  })

  it('creates grants for digital order items linked to product digital assets', async () => {
    mocks.prisma.digitalDownloadGrant.createMany.mockResolvedValue({ count: 2 })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 2,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    expect(mocks.prisma.digitalDownloadGrant.createMany).toHaveBeenCalledTimes(1)
    const createArgs = mocks.prisma.digitalDownloadGrant.createMany.mock.calls[0][0]
    expect(createArgs.skipDuplicates).toBe(true)
    expect(createArgs.data).toHaveLength(2)
    for (const row of createArgs.data) {
      expect(row).toMatchObject({
        storeId: 'store_1',
        orderId: 'order_1',
        orderItemId: 'item_1',
        productId: 'product_1',
        downloadLimit: 5,
      })
      expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/)
      expect(row).not.toHaveProperty('token')
    }
  })

  it('is idempotent when grants already exist for order item and digital asset pairs', async () => {
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([
      { orderItemId: 'item_1', digitalAssetId: 'asset_1' },
      { orderItemId: 'item_1', digitalAssetId: 'asset_2' },
    ])

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 0,
      skippedExisting: 2,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    expect(mocks.prisma.digitalDownloadGrant.createMany).not.toHaveBeenCalled()
  })

  it('does not fail when a digital product has no linked asset and records a warning-safe skip', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...buildOrderFixture(),
      items: [
        {
          id: 'item_1',
          productId: 'product_1',
          title: 'Digital Product',
          product: {
            id: 'product_1',
            fulfillmentType: 'DIGITAL',
            digitalAssets: [],
          },
        },
      ],
    })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 0,
      skippedExisting: 0,
      missingLinkedAssets: 1,
      mixedOrderDetected: false,
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.digitalDownloadGrant.createMany).not.toHaveBeenCalled()
  })

  it('does not create grants for physical-only orders', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...buildOrderFixture(),
      items: [
        {
          id: 'item_1',
          productId: 'product_1',
          title: 'Physical Product',
          product: {
            id: 'product_1',
            fulfillmentType: 'PHYSICAL',
            digitalAssets: [{ digitalAssetId: 'asset_1' }],
          },
        },
      ],
    })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 0,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    expect(mocks.prisma.digitalDownloadGrant.createMany).not.toHaveBeenCalled()
  })

  it('handles mixed orders safely and only creates grants for digital items', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...buildOrderFixture(),
      items: [
        {
          id: 'item_digital',
          productId: 'product_digital',
          title: 'Digital Product',
          product: {
            id: 'product_digital',
            fulfillmentType: 'DIGITAL',
            digitalAssets: [{ digitalAssetId: 'asset_1' }],
          },
        },
        {
          id: 'item_physical',
          productId: 'product_physical',
          title: 'Physical Product',
          product: {
            id: 'product_physical',
            fulfillmentType: 'PHYSICAL',
            digitalAssets: [{ digitalAssetId: 'asset_2' }],
          },
        },
      ],
    })
    mocks.prisma.digitalDownloadGrant.createMany.mockResolvedValue({ count: 1 })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 1,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: true,
    })
    expect(mocks.prisma.digitalDownloadGrant.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ orderItemId: 'item_digital', digitalAssetId: 'asset_1' })],
      })
    )
  })

  it('skips issuance when order is not paid', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...buildOrderFixture(),
      paymentStatus: 'PENDING',
    })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 0,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    expect(mocks.prisma.digitalDownloadGrant.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.digitalDownloadGrant.createMany).not.toHaveBeenCalled()
  })
})

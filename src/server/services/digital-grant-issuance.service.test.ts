import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decrypt } from '@/server/utils/crypto'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
    digitalDownloadGrant: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    digitalDownloadGrant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    digitalDownloadDelivery: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  getStoreSettingsLite: vi.fn(),
  createDownloadToken: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

vi.mock('@/server/services/digital-download-grant.service', async () => {
  const actual = await vi.importActual<typeof import('@/server/services/digital-download-grant.service')>(
    '@/server/services/digital-download-grant.service'
  )

  return {
    ...actual,
    createDownloadToken: mocks.createDownloadToken,
  }
})

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
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-digital-delivery'

    mocks.prisma.order.findUnique.mockResolvedValue(buildOrderFixture())
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([])
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx)
    )

    mocks.tx.digitalDownloadGrant.create.mockImplementation(async ({ data }: { data: { digitalAssetId: string } }) => ({
      id: `grant_${data.digitalAssetId}`,
    }))
    mocks.tx.digitalDownloadGrant.findUnique.mockResolvedValue(null)
    mocks.tx.digitalDownloadGrant.update.mockResolvedValue({ id: 'grant_existing' })
    mocks.tx.digitalDownloadDelivery.findUnique.mockResolvedValue(null)
    mocks.tx.digitalDownloadDelivery.create.mockResolvedValue({ id: 'delivery_1' })

    mocks.getStoreSettingsLite.mockResolvedValue({ id: 'store_1' })
    mocks.createDownloadToken.mockReturnValue('raw-token-default')
  })

  it('creates grants with hashed tokens and encrypted delivery tokens (no plaintext persistence)', async () => {
    mocks.createDownloadToken
      .mockReturnValueOnce('raw-token-asset-1')
      .mockReturnValueOnce('raw-token-asset-2')

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 2,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })

    expect(mocks.tx.digitalDownloadGrant.create).toHaveBeenCalledTimes(2)
    const grantCreates = mocks.tx.digitalDownloadGrant.create.mock.calls.map((call) => call[0])
    expect(grantCreates[0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(grantCreates[1].data.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(grantCreates[0].data).not.toHaveProperty('token')
    expect(grantCreates[1].data).not.toHaveProperty('token')

    expect(mocks.tx.digitalDownloadDelivery.create).toHaveBeenCalledTimes(2)
    const deliveryCreates = mocks.tx.digitalDownloadDelivery.create.mock.calls.map((call) => call[0].data)
    expect(deliveryCreates[0].tokenEnc).not.toBe('raw-token-asset-1')
    expect(deliveryCreates[1].tokenEnc).not.toBe('raw-token-asset-2')
    expect(decrypt(deliveryCreates[0].tokenEnc)).toBe('raw-token-asset-1')
    expect(decrypt(deliveryCreates[1].tokenEnc)).toBe('raw-token-asset-2')
  })

  it('is idempotent when grants and delivery rows already exist', async () => {
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([
      { id: 'grant_1', orderItemId: 'item_1', digitalAssetId: 'asset_1' },
      { id: 'grant_2', orderItemId: 'item_1', digitalAssetId: 'asset_2' },
    ])
    mocks.tx.digitalDownloadDelivery.findUnique.mockResolvedValue({ id: 'delivery_existing' })

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 0,
      skippedExisting: 2,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    expect(mocks.tx.digitalDownloadGrant.create).not.toHaveBeenCalled()
    expect(mocks.tx.digitalDownloadGrant.update).not.toHaveBeenCalled()
    expect(mocks.tx.digitalDownloadDelivery.create).not.toHaveBeenCalled()
  })

  it('backfills missing delivery rows by rotating to a new hashed token and encrypted tokenEnc', async () => {
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([
      { id: 'grant_existing', orderItemId: 'item_1', digitalAssetId: 'asset_1' },
    ])
    mocks.createDownloadToken.mockReturnValue('raw-backfill-token')

    const result = await issueDigitalDownloadGrantsForPaidOrder({ orderId: 'order_1' })

    expect(result).toEqual({
      created: 1,
      skippedExisting: 1,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })

    expect(mocks.tx.digitalDownloadGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant_existing' },
      data: {
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })

    const createdDelivery = mocks.tx.digitalDownloadDelivery.create.mock.calls.at(-1)?.[0]?.data
    expect(createdDelivery).toBeDefined()
    expect(createdDelivery.tokenEnc).not.toBe('raw-backfill-token')
    expect(decrypt(createdDelivery.tokenEnc)).toBe('raw-backfill-token')
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
    expect(mocks.tx.digitalDownloadGrant.create).not.toHaveBeenCalled()
    expect(mocks.tx.digitalDownloadDelivery.create).not.toHaveBeenCalled()
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
    expect(mocks.tx.digitalDownloadGrant.create).not.toHaveBeenCalled()
    expect(mocks.tx.digitalDownloadDelivery.create).not.toHaveBeenCalled()
  })
})

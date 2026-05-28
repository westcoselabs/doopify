import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encrypt } from '@/server/utils/crypto'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
    digitalDownloadGrant: {
      findMany: vi.fn(),
    },
  },
  tx: {
    digitalDownloadDelivery: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    digitalDownloadGrant: {
      update: vi.fn(),
    },
  },
  createDownloadToken: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
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

import {
  ensureDigitalDownloadDeliveryToken,
  getBuyerDigitalDownloadAvailabilityForPaidOrder,
} from './digital-download-delivery.service'

describe('digital-download-delivery.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-delivery-service'
    process.env.NEXT_PUBLIC_STORE_URL = 'https://store.example.com'

    mocks.tx.digitalDownloadDelivery.findUnique.mockResolvedValue(null)
    mocks.tx.digitalDownloadDelivery.create.mockResolvedValue({ id: 'delivery_1' })
    mocks.tx.digitalDownloadGrant.update.mockResolvedValue({ id: 'grant_1' })
    mocks.createDownloadToken.mockReturnValue('generated-token')
  })

  it('stores tokenEnc only and never plaintext token in persistence payload', async () => {
    await ensureDigitalDownloadDeliveryToken({
      tx: mocks.tx as never,
      grantId: 'grant_1',
      rawToken: 'raw-token-to-encrypt',
    })

    expect(mocks.tx.digitalDownloadDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grantId: 'grant_1',
        tokenEnc: expect.any(String),
      }),
    })

    const persisted = mocks.tx.digitalDownloadDelivery.create.mock.calls[0][0].data
    expect(persisted.tokenEnc).not.toBe('raw-token-to-encrypt')
    expect(Object.keys(persisted)).not.toContain('token')
    expect(JSON.stringify(persisted)).not.toContain('raw-token-to-encrypt')
  })

  it('rotates grant tokenHash when backfilling a missing delivery token', async () => {
    mocks.createDownloadToken.mockReturnValue('replacement-raw-token')

    const result = await ensureDigitalDownloadDeliveryToken({
      tx: mocks.tx as never,
      grantId: 'grant_2',
    })

    expect(result).toEqual({ created: true, rotatedGrantToken: true })
    expect(mocks.tx.digitalDownloadGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant_2' },
      data: {
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })
  })

  it('returns buyer-safe download links for paid digital orders without tokenHash/storageKey exposure', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      paymentStatus: 'PAID',
      items: [
        {
          id: 'item_1',
          product: {
            fulfillmentType: 'DIGITAL',
          },
        },
      ],
    })
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([
      {
        downloadLimit: 5,
        downloadCount: 1,
        expiresAt: new Date('2026-06-27T00:00:00.000Z'),
        digitalAsset: {
          fileName: 'Guide.pdf',
          title: 'Guide',
        },
        delivery: {
          tokenEnc: encrypt('raw-download-token'),
        },
      },
    ])

    const result = await getBuyerDigitalDownloadAvailabilityForPaidOrder({
      orderId: 'order_1',
      absoluteUrls: true,
    })

    expect(result.hasDigitalItems).toBe(true)
    expect(result.pending).toBe(false)
    expect(result.downloads).toEqual([
      {
        fileName: 'Guide.pdf',
        title: 'Guide',
        downloadUrl: 'https://store.example.com/api/digital-downloads/raw-download-token',
        expiresAt: new Date('2026-06-27T00:00:00.000Z'),
        downloadLimit: 5,
        downloadCount: 1,
      },
    ])
    expect(JSON.stringify(result)).not.toContain('tokenHash')
    expect(JSON.stringify(result)).not.toContain('storageKey')
  })

  it('returns pending for paid digital orders when delivery token is unavailable', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      paymentStatus: 'PAID',
      items: [
        {
          id: 'item_1',
          product: {
            fulfillmentType: 'DIGITAL',
          },
        },
      ],
    })
    mocks.prisma.digitalDownloadGrant.findMany.mockResolvedValue([
      {
        downloadLimit: 5,
        downloadCount: 0,
        expiresAt: new Date('2026-06-27T00:00:00.000Z'),
        digitalAsset: {
          fileName: 'Guide.pdf',
          title: 'Guide',
        },
        delivery: null,
      },
    ])

    const result = await getBuyerDigitalDownloadAvailabilityForPaidOrder({
      orderId: 'order_2',
      absoluteUrls: true,
    })

    expect(result).toEqual({
      hasDigitalItems: true,
      pending: true,
      downloads: [],
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashDownloadToken } from '@/server/services/digital-download-grant.service'
import { decrypt, encrypt } from '@/server/utils/crypto'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: {
      findFirst: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
    emailDelivery: {
      findFirst: vi.fn(),
    },
    digitalDownloadGrant: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    digitalDownloadDelivery: {
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  ensureDigitalDownloadDeliveryToken: vi.fn(),
  queueOrderConfirmationEmailDelivery: vi.fn(),
  createDownloadToken: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/digital-download-delivery.service', () => ({
  ensureDigitalDownloadDeliveryToken: mocks.ensureDigitalDownloadDeliveryToken,
}))

vi.mock('@/server/services/email-delivery.service', () => ({
  queueOrderConfirmationEmailDelivery: mocks.queueOrderConfirmationEmailDelivery,
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
  DigitalDeliveryAdminServiceError,
  getAdminDigitalDownloadLink,
  getOrderDigitalDeliverySummary,
  regenerateDigitalDownloadGrant,
  resendOrderDigitalDownloads,
  revokeDigitalDownloadGrant,
} from './digital-delivery-admin.service'

describe('digital-delivery-admin.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENCRYPTION_KEY = 'digital-delivery-admin-test-key'

    mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store_1' })
    mocks.prisma.emailDelivery.findFirst.mockResolvedValue(null)
    mocks.prisma.digitalDownloadGrant.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.digitalDownloadGrant.update.mockResolvedValue({ id: 'grant_1' })
    mocks.prisma.digitalDownloadDelivery.update.mockResolvedValue({ id: 'delivery_1' })
    mocks.prisma.digitalDownloadDelivery.create.mockResolvedValue({ id: 'delivery_1' })
    mocks.queueOrderConfirmationEmailDelivery.mockResolvedValue({
      delivery: { id: 'email_1', status: 'PENDING' },
      job: { id: 'job_1' },
    })
    mocks.ensureDigitalDownloadDeliveryToken.mockResolvedValue({
      created: false,
      rotatedGrantToken: false,
    })
    mocks.createDownloadToken.mockReturnValue('new-raw-token')

    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)({
          digitalDownloadGrant: mocks.prisma.digitalDownloadGrant,
          digitalDownloadDelivery: mocks.prisma.digitalDownloadDelivery,
        })
      }
      return Promise.resolve(null)
    })
  })

  it('returns safe digital-delivery summary data without token or storage exposure', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      orderNumber: 1001,
      email: 'buyer@example.com',
      items: [
        {
          id: 'item_1',
          product: {
            fulfillmentType: 'DIGITAL',
          },
        },
      ],
      digitalDownloadGrants: [
        {
          id: 'grant_1',
          orderItemId: 'item_1',
          digitalAssetId: 'asset_1',
          downloadLimit: 5,
          downloadCount: 1,
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          revokedAt: null,
          lastDownloadedAt: new Date('2026-05-28T09:00:00.000Z'),
          digitalAsset: {
            fileName: 'Guide.pdf',
            title: 'Guide',
          },
          delivery: {
            tokenEnc: encrypt('raw-download-token'),
          },
          events: [
            {
              id: 'evt_1',
              result: 'ALLOWED',
              occurredAt: new Date('2026-05-28T09:00:00.000Z'),
            },
          ],
        },
      ],
    })
    mocks.prisma.emailDelivery.findFirst.mockResolvedValue({
      status: 'SENT',
      sentAt: new Date('2026-05-28T09:05:00.000Z'),
    })

    const result = await getOrderDigitalDeliverySummary('order_1')

    expect(result).toMatchObject({
      orderId: 'order_1',
      hasDigitalItems: true,
      pending: false,
      deliveryEmailStatus: 'SENT',
      grants: [
        {
          grantId: 'grant_1',
          title: 'Guide',
          fileName: 'Guide.pdf',
          status: 'ACTIVE',
          downloadCount: 1,
          downloadLimit: 5,
          deliveryTokenAvailable: true,
          deliveryEmailStatus: 'SENT',
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('tokenHash')
    expect(JSON.stringify(result)).not.toContain('tokenEnc')
    expect(JSON.stringify(result)).not.toContain('storageKey')
  })

  it('returns download link path from decrypted delivery token', async () => {
    mocks.prisma.digitalDownloadGrant.findFirst.mockResolvedValue({
      id: 'grant_1',
      downloadLimit: 5,
      downloadCount: 0,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
      delivery: {
        id: 'delivery_1',
        tokenEnc: encrypt('token_value_123'),
      },
    })

    const result = await getAdminDigitalDownloadLink('grant_1')

    expect(result).toEqual({
      grantId: 'grant_1',
      downloadUrl: '/api/digital-downloads/token_value_123',
    })
    expect(JSON.stringify(result)).not.toContain('tokenHash')
    expect(JSON.stringify(result)).not.toContain('storageKey')
  })

  it('resends digital-delivery email using existing order confirmation flow', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      orderNumber: 1001,
      email: 'buyer@example.com',
      items: [
        {
          id: 'item_1',
          product: {
            fulfillmentType: 'DIGITAL',
          },
        },
      ],
      digitalDownloadGrants: [
        {
          id: 'grant_1',
          orderItemId: 'item_1',
          digitalAssetId: 'asset_1',
          downloadLimit: 5,
          downloadCount: 1,
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          revokedAt: null,
          lastDownloadedAt: null,
          digitalAsset: {
            fileName: 'Guide.pdf',
            title: 'Guide',
          },
          delivery: null,
          events: [],
        },
      ],
    })
    mocks.ensureDigitalDownloadDeliveryToken.mockResolvedValue({
      created: true,
      rotatedGrantToken: true,
    })

    const result = await resendOrderDigitalDownloads('order_1')

    expect(result).toEqual({
      queued: true,
      orderId: 'order_1',
      orderNumber: 1001,
      emailDeliveryId: 'email_1',
      emailDeliveryStatus: 'PENDING',
      jobId: 'job_1',
      rotatedMissingDeliveryTokens: 1,
    })
    expect(mocks.ensureDigitalDownloadDeliveryToken).toHaveBeenCalledWith({
      tx: expect.anything(),
      grantId: 'grant_1',
    })
    expect(mocks.queueOrderConfirmationEmailDelivery).toHaveBeenCalledWith({
      orderId: 'order_1',
      orderNumber: 1001,
      email: 'buyer@example.com',
    })
  })

  it('revokes digital access by setting revokedAt', async () => {
    const result = await revokeDigitalDownloadGrant('grant_1')

    expect(result.grantId).toBe('grant_1')
    expect(result.alreadyRevoked).toBe(false)
    expect(result.revokedAt).toBeInstanceOf(Date)
    expect(mocks.prisma.digitalDownloadGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'grant_1', storeId: 'store_1' }),
      })
    )
  })

  it('regenerates token hash and encrypted token while preserving download count', async () => {
    const oldTokenHash = hashDownloadToken('old-token')
    mocks.prisma.digitalDownloadGrant.findFirst.mockResolvedValue({
      id: 'grant_1',
      downloadLimit: 5,
      downloadCount: 2,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      revokedAt: null,
      delivery: {
        id: 'delivery_1',
        tokenEnc: encrypt('old-token'),
      },
    })

    const result = await regenerateDigitalDownloadGrant('grant_1')

    expect(result).toEqual({
      grantId: 'grant_1',
      downloadUrl: '/api/digital-downloads/new-raw-token',
      preservedDownloadCount: true,
      downloadCount: 2,
      downloadLimit: 5,
      status: 'ACTIVE',
    })
    expect(mocks.prisma.digitalDownloadGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant_1' },
      data: {
        tokenHash: hashDownloadToken('new-raw-token'),
      },
    })
    expect(hashDownloadToken('new-raw-token')).not.toBe(oldTokenHash)
    const tokenEnc = mocks.prisma.digitalDownloadDelivery.update.mock.calls[0][0].data.tokenEnc
    expect(decrypt(tokenEnc)).toBe('new-raw-token')
  })

  it('blocks cross-store grant access', async () => {
    mocks.prisma.digitalDownloadGrant.findFirst.mockResolvedValue(null)

    await expect(getAdminDigitalDownloadLink('grant_other_store')).rejects.toMatchObject({
      code: 'GRANT_NOT_FOUND',
      status: 404,
    } satisfies Partial<DigitalDeliveryAdminServiceError>)
  })

  it('returns empty digital summary for physical-only orders', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order_2',
      orderNumber: 1002,
      email: 'buyer@example.com',
      items: [
        {
          id: 'item_1',
          product: {
            fulfillmentType: 'PHYSICAL',
          },
        },
      ],
      digitalDownloadGrants: [],
    })

    const result = await getOrderDigitalDeliverySummary('order_2')
    expect(result).toEqual({
      orderId: 'order_2',
      orderNumber: 1002,
      hasDigitalItems: false,
      pending: false,
      deliveryEmailStatus: null,
      deliveryEmailLastSentAt: null,
      grants: [],
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
    },
    fulfillment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shippingLabel: {
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  enqueueJob: vi.fn(),
  getShippingProviderTrackingStatus: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/jobs/job.service', () => ({
  enqueueJob: mocks.enqueueJob,
}))
vi.mock('@/server/shipping/shipping-provider.service', () => ({
  getShippingProviderTrackingStatus: mocks.getShippingProviderTrackingStatus,
}))

import {
  processShippingTrackingSyncJob,
  queueShippingTrackingSyncJob,
} from './shipping-tracking-jobs.service'

describe('shipping tracking jobs service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma)
    )
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', type: 'SYNC_SHIPPING_TRACKING' })
    mocks.prisma.job.findFirst.mockResolvedValue(null)
    mocks.prisma.shippingLabel.update.mockResolvedValue({})
    mocks.getShippingProviderTrackingStatus.mockResolvedValue({
      providerStatus: 'IN_TRANSIT',
      lifecycleStatus: 'IN_TRANSIT',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example.com/TRACK123',
    })
  })

  it('queues sync jobs with bounded retries', async () => {
    const result = await queueShippingTrackingSyncJob({
      fulfillmentId: 'ful_1',
      orderId: 'order_1',
    })

    expect(result).toEqual({ id: 'job-1', type: 'SYNC_SHIPPING_TRACKING' })
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      'SYNC_SHIPPING_TRACKING',
      { fulfillmentId: 'ful_1', orderId: 'order_1' },
      expect.objectContaining({ maxAttempts: 5 }),
      undefined
    )
  })

  it('returns no changes when tracking data is already synchronized', async () => {
    mocks.getShippingProviderTrackingStatus.mockRejectedValueOnce(new Error('Provider unavailable'))
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      status: 'OPEN',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example.com/TRACK123',
      shippingLabels: [
        {
          id: 'label_1',
          provider: 'EASYPOST',
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://tracking.example.com/TRACK123',
          createdAt: new Date(),
        },
      ],
    })

    const result = await processShippingTrackingSyncJob({
      fulfillmentId: 'ful_1',
    })

    expect(result).toEqual({ synced: false, reason: 'NO_CHANGES' })
    expect(mocks.prisma.fulfillment.update).not.toHaveBeenCalled()
    expect(mocks.prisma.orderEvent.create).not.toHaveBeenCalled()
  })

  it('backfills tracking fields and promotes pending fulfillment when label has tracking', async () => {
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      status: 'PENDING',
      trackingNumber: null,
      trackingUrl: null,
      shippingLabels: [
        {
          id: 'label_1',
          provider: 'EASYPOST',
          providerShipmentId: 'shp_1',
          providerLabelId: 'trk_1',
          carrier: 'USPS',
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://tracking.example.com/TRACK123',
          createdAt: new Date(),
        },
      ],
    })
    mocks.prisma.fulfillment.update.mockResolvedValue({})
    mocks.prisma.orderEvent.create.mockResolvedValue({})

    const result = await processShippingTrackingSyncJob({
      fulfillmentId: 'ful_1',
      orderId: 'order_1',
    })

    expect(result).toEqual({ synced: true })
    expect(mocks.prisma.fulfillment.update).toHaveBeenCalledWith({
      where: { id: 'ful_1' },
      data: {
        status: 'OPEN',
        trackingNumber: 'TRACK123',
        trackingUrl: 'https://tracking.example.com/TRACK123',
        deliveredAt: undefined,
      },
    })
    expect(mocks.prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          type: 'SHIPPING_TRACKING_SYNCED',
        }),
      })
    )
  })

  it('marks fulfillment delivered when provider tracking reports delivered', async () => {
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      status: 'OPEN',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example.com/TRACK123',
      deliveredAt: null,
      shippingLabels: [
        {
          id: 'label_1',
          provider: 'EASYPOST',
          providerShipmentId: 'shp_1',
          providerLabelId: 'trk_1',
          carrier: 'USPS',
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://tracking.example.com/TRACK123',
          createdAt: new Date(),
        },
      ],
    })
    mocks.getShippingProviderTrackingStatus.mockResolvedValue({
      providerStatus: 'DELIVERED',
      lifecycleStatus: 'DELIVERED',
      deliveredAt: '2026-04-29T21:00:00.000Z',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example.com/TRACK123',
    })

    const result = await processShippingTrackingSyncJob({
      fulfillmentId: 'ful_1',
      orderId: 'order_1',
    })

    expect(result).toEqual({ synced: true })
    expect(mocks.prisma.fulfillment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ful_1' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://tracking.example.com/TRACK123',
          deliveredAt: new Date('2026-04-29T21:00:00.000Z'),
        }),
      })
    )
    expect(mocks.prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          type: 'SHIPPING_DELIVERED',
        }),
      })
    )
  })
})

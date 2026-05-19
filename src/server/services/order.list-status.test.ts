import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: vi.fn(),
}))

import { getOrders } from './order.service'

function buildOrder({
  id,
  fulfillmentStatus = 'UNFULFILLED',
  fulfillments = [],
  itemQuantity = 2,
}: {
  id: string
  fulfillmentStatus?: string
  fulfillments?: Array<{
    status: string
    deliveredAt?: Date | null
    items: Array<{ orderItemId: string; quantity: number }>
  }>
  itemQuantity?: number
}) {
  return {
    id,
    orderNumber: Number(id.replace(/\D/g, '') || 1001),
    status: 'OPEN',
    paymentStatus: 'PAID',
    fulfillmentStatus,
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    customer: null,
    items: [
      {
        id: `${id}_item_1`,
        quantity: itemQuantity,
      },
    ],
    addresses: [],
    payments: [],
    fulfillments,
    returns: [],
  }
}

describe('getOrders fulfillment status derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.order.count.mockResolvedValue(3)
  })

  it('returns not-shipped/unfulfilled when no fulfillment records exist', async () => {
    mocks.prisma.order.findMany.mockResolvedValue([
      buildOrder({ id: 'ord_1001', fulfillmentStatus: 'FULFILLED', fulfillments: [] }),
    ])

    const result = await getOrders({ page: 1, pageSize: 20 })
    expect(result.orders[0]).toMatchObject({
      fulfillmentStatus: 'UNFULFILLED',
      fulfillmentStatusDerived: 'UNFULFILLED',
      shippingStatusDerived: 'NOT_SHIPPED',
    })
  })

  it('returns partially shipped when only some quantities are fulfilled', async () => {
    mocks.prisma.order.findMany.mockResolvedValue([
      buildOrder({
        id: 'ord_1002',
        fulfillments: [
          {
            status: 'SUCCESS',
            deliveredAt: null,
            items: [{ orderItemId: 'ord_1002_item_1', quantity: 1 }],
          },
        ],
      }),
    ])

    const result = await getOrders({ page: 1, pageSize: 20 })
    expect(result.orders[0]).toMatchObject({
      fulfillmentStatus: 'PARTIALLY_FULFILLED',
      fulfillmentStatusDerived: 'PARTIALLY_FULFILLED',
      shippingStatusDerived: 'PARTIALLY_SHIPPED',
    })
  })

  it('returns delivered when all shipment records have deliveredAt', async () => {
    mocks.prisma.order.findMany.mockResolvedValue([
      buildOrder({
        id: 'ord_1003',
        fulfillments: [
          {
            status: 'SUCCESS',
            deliveredAt: new Date('2026-05-02T11:00:00.000Z'),
            items: [{ orderItemId: 'ord_1003_item_1', quantity: 2 }],
          },
        ],
      }),
    ])

    const result = await getOrders({ page: 1, pageSize: 20 })
    expect(result.orders[0]).toMatchObject({
      fulfillmentStatus: 'FULFILLED',
      fulfillmentStatusDerived: 'FULFILLED',
      shippingStatusDerived: 'DELIVERED',
    })
  })

  it('caps list page size and queries orders with an explicit select profile', async () => {
    mocks.prisma.order.findMany.mockResolvedValue([
      buildOrder({ id: 'ord_1004', fulfillments: [] }),
    ])

    const result = await getOrders({ page: 0, pageSize: 999 })

    expect(mocks.prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
        select: expect.objectContaining({
          id: true,
          orderNumber: true,
          customer: expect.any(Object),
          items: expect.any(Object),
          addresses: expect.any(Object),
          payments: expect.any(Object),
          fulfillments: expect.any(Object),
        }),
      })
    )
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 100,
      total: 3,
      totalPages: 1,
    })
    expect(result.orders[0]).toMatchObject({
      id: 'ord_1004',
      orderNumber: 1004,
      customer: null,
      items: expect.any(Array),
      addresses: expect.any(Array),
      payments: expect.any(Array),
      fulfillments: expect.any(Array),
      returns: expect.any(Array),
    })
  })
})

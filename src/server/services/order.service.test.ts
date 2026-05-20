import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    productVariant: {
      updateMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
    customer: {
      update: vi.fn(),
    },
    discount: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  emitInternalEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

import { createOrder } from './order.service'

function createPersistedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_1',
    orderNumber: 1001,
    email: 'buyer@example.com',
    totalCents: 2000,
    currency: 'USD',
    paymentStatus: 'PAID',
    addresses: [
      {
        type: 'SHIPPING',
        firstName: 'Ada',
        lastName: 'Lovelace',
        address1: '1 Compute Way',
        city: 'London',
        province: 'London',
        postalCode: 'N1 1AA',
        country: 'GB',
      },
    ],
    items: [
      {
        title: 'Test Shirt',
        variantTitle: 'Default',
        quantity: 2,
        priceCents: 1000,
      },
    ],
    ...overrides,
  }
}

describe('createOrder inventory and payment side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.prisma.order.findFirst.mockResolvedValue(null)
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        productVariant: mocks.tx.productVariant,
        order: mocks.tx.order,
        customer: mocks.tx.customer,
        discount: mocks.tx.discount,
      })
    )

    mocks.tx.productVariant.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.order.create.mockResolvedValue(createPersistedOrder())
    mocks.tx.customer.update.mockResolvedValue({})
    mocks.tx.discount.findUnique.mockResolvedValue({
      id: 'disc_1',
      usageCount: 0,
      usageLimit: 5,
    })
    mocks.tx.discount.update.mockResolvedValue({})
    mocks.tx.discount.updateMany.mockResolvedValue({ count: 1 })
  })

  it('does not decrement inventory for pending orders and keeps paid-only side effects off', async () => {
    mocks.tx.order.create.mockResolvedValue(
      createPersistedOrder({
        paymentStatus: 'PENDING',
      })
    )

    await createOrder({
      customerId: 'cust_1',
      email: 'buyer@example.com',
      paymentStatus: 'PENDING',
      items: [
        {
          productId: 'prod_1',
          variantId: 'var_1',
          title: 'Test Shirt',
          variantTitle: 'Default',
          priceCents: 1000,
          quantity: 2,
        },
      ],
      discountApplications: [
        {
          discountId: 'disc_1',
          amountCents: 200,
          code: 'SAVE20',
          method: 'FIXED_AMOUNT',
          title: 'Save 20',
        },
      ],
    })

    expect(mocks.tx.productVariant.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'PENDING',
          discountApplications: undefined,
        }),
      })
    )
    expect(mocks.tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust_1' },
      data: { orderCount: { increment: 1 } },
    })
    expect(mocks.tx.discount.findUnique).not.toHaveBeenCalled()
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({
        orderId: 'ord_1',
      })
    )
    expect(mocks.emitInternalEvent).not.toHaveBeenCalledWith('order.paid', expect.any(Object))
  })

  it('decrements inventory once for paid orders and runs paid lifecycle side effects once', async () => {
    await createOrder({
      customerId: 'cust_1',
      email: 'buyer@example.com',
      paymentStatus: 'PAID',
      items: [
        {
          productId: 'prod_1',
          variantId: 'var_1',
          title: 'Test Shirt',
          variantTitle: 'Default',
          priceCents: 1000,
          quantity: 2,
        },
      ],
      discountApplications: [
        {
          discountId: 'disc_1',
          amountCents: 200,
          code: 'SAVE20',
          method: 'FIXED_AMOUNT',
          title: 'Save 20',
        },
      ],
    })

    expect(mocks.tx.productVariant.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'var_1',
        OR: [{ continueSellingWhenOutOfStock: true }, { inventory: { gte: 2 } }],
      },
      data: { inventory: { decrement: 2 } },
    })
    expect(mocks.tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: 'PAID',
          discountApplications: {
            create: [{ discountId: 'disc_1', amountCents: 200 }],
          },
        }),
      })
    )
    expect(mocks.tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust_1' },
      data: {
        orderCount: { increment: 1 },
        totalSpentCents: { increment: 2000 },
      },
    })
    expect(mocks.tx.discount.findUnique).toHaveBeenCalledWith({
      where: { id: 'disc_1' },
      select: {
        id: true,
        usageCount: true,
        usageLimit: true,
      },
    })
    expect(mocks.tx.discount.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'disc_1',
        usageCount: 0,
        usageLimit: 5,
      },
      data: { usageCount: { increment: 1 } },
    })
    expect(
      mocks.emitInternalEvent.mock.calls.filter((call) => call[0] === 'order.paid')
    ).toHaveLength(1)
  })

  it('fails safely for paid orders with insufficient inventory and does not create an order', async () => {
    mocks.tx.productVariant.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      createOrder({
        customerId: 'cust_1',
        email: 'buyer@example.com',
        paymentStatus: 'PAID',
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            title: 'Test Shirt',
            variantTitle: 'Default',
            priceCents: 1000,
            quantity: 2,
          },
        ],
      })
    ).rejects.toThrow('Insufficient inventory for variant var_1')

    expect(mocks.tx.order.create).not.toHaveBeenCalled()
    expect(mocks.tx.customer.update).not.toHaveBeenCalled()
    expect(mocks.emitInternalEvent).not.toHaveBeenCalled()
  })

  it('preserves Stripe payment-intent idempotency by returning existing order without running a new transaction', async () => {
    const existingOrder = createPersistedOrder({
      id: 'ord_existing',
      orderNumber: 1440,
      payments: [{ stripePaymentIntentId: 'pi_dup_1' }],
    })
    mocks.prisma.order.findFirst.mockResolvedValue(existingOrder)

    const result = await createOrder({
      email: 'buyer@example.com',
      paymentStatus: 'PAID',
      stripePaymentIntentId: 'pi_dup_1',
      items: [
        {
          productId: 'prod_1',
          variantId: 'var_1',
          title: 'Test Shirt',
          variantTitle: 'Default',
          priceCents: 1000,
          quantity: 2,
        },
      ],
    })

    expect(result).toBe(existingOrder)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.productVariant.updateMany).not.toHaveBeenCalled()
  })
})

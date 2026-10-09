import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORDER_ID = 'order-1'
const ORDER_NUMBER = 1001
const PAYMENT_ID = 'payment-1'
const ORDER_ITEM_ID = 'order-item-1'
const VARIANT_ID = 'variant-1'
const RETURN_ID = 'return-1'
const REFUND_ID = 'refund-1'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      update: vi.fn(),
    },
    refund: {
      create: vi.fn(),
      update: vi.fn(),
    },
    return: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    productVariant: {
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  createStripeRefund: vi.fn(),
  emitInternalEvent: vi.fn(),
  safeAuditReturnEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/stripe', () => ({ createStripeRefund: mocks.createStripeRefund }))
vi.mock('@/server/events/outbox', () => ({
  enqueueCommerceEvent: (_tx: unknown, event: unknown, payload: unknown) => mocks.emitInternalEvent(event, payload),
}))

vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: mocks.emitInternalEvent }))
vi.mock('@/server/services/return-audit.service', () => ({
  safeAuditReturnEvent: mocks.safeAuditReturnEvent,
}))

import {
  createPaymentRefundRecord,
  createReturnRecord,
  getOrderAdjustmentSummary,
  updateReturnRecord,
} from './order-adjustments.service'

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    currency: 'USD',
    paymentStatus: 'PAID',
    items: [
      {
        id: ORDER_ITEM_ID,
        title: 'Sample Item',
        variantId: VARIANT_ID,
        quantity: 2,
        priceCents: 5000,
        totalCents: 10000,
      },
    ],
    payments: [
      {
        id: PAYMENT_ID,
        amountCents: 10000,
        status: 'PAID',
        stripeChargeId: 'ch_test',
        stripePaymentIntentId: 'pi_test',
      },
    ],
    refunds: [],
    returns: [],
    ...overrides,
  }
}

function setupTx() {
  mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.prisma) => Promise<unknown>) => cb(mocks.prisma))
}

beforeEach(() => {
  vi.clearAllMocks()
  setupTx()
  mocks.emitInternalEvent.mockResolvedValue(undefined)
  mocks.safeAuditReturnEvent.mockResolvedValue(undefined)
  mocks.prisma.order.update.mockResolvedValue({})
  mocks.prisma.payment.update.mockResolvedValue({})
  mocks.prisma.productVariant.update.mockResolvedValue({})
  mocks.prisma.orderEvent.create.mockResolvedValue({})
})

describe('getOrderAdjustmentSummary', () => {
  it('computes paid/refunded/remaining amounts and item quantities server-side', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(
      buildOrder({
        refunds: [
          {
            id: REFUND_ID,
            paymentId: PAYMENT_ID,
            amountCents: 3000,
            status: 'ISSUED',
            reason: 'requested_by_customer',
            note: null,
            createdAt: new Date('2026-04-29T00:00:00.000Z'),
            stripeRefundId: 're_1',
            items: [
              {
                id: 'refund-item-1',
                orderItemId: ORDER_ITEM_ID,
                variantId: VARIANT_ID,
                quantity: 1,
                amountCents: 3000,
              },
            ],
          },
        ],
        returns: [
          {
            id: RETURN_ID,
            refundId: null,
            status: 'REQUESTED',
            reason: 'Damaged',
            note: null,
            receivedAt: null,
            createdAt: new Date('2026-04-29T00:00:00.000Z'),
            items: [
              {
                id: 'return-item-1',
                orderItemId: ORDER_ITEM_ID,
                variantId: VARIANT_ID,
                quantity: 1,
                reason: 'Damaged',
              },
            ],
          },
        ],
      })
    )

    const summary = await getOrderAdjustmentSummary(ORDER_ID)

    expect(summary.paidAmountCents).toBe(10000)
    expect(summary.recordedRefundAmountCents).toBe(3000)
    expect(summary.remainingRefundableAmountCents).toBe(7000)
    expect(summary.orderItems[0]).toMatchObject({
      purchasedQuantity: 2,
      refundedQuantity: 1,
      returnedQuantity: 1,
      remainingEligibleQuantity: 1,
    })
  })
})

describe('createPaymentRefundRecord', () => {
  it('rejects refunds above remaining refundable amount', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(
      buildOrder({
        refunds: [
          {
            id: REFUND_ID,
            paymentId: PAYMENT_ID,
            amountCents: 3000,
            status: 'ISSUED',
            reason: 'requested_by_customer',
            note: null,
            createdAt: new Date(),
            stripeRefundId: 're_1',
            items: [],
          },
        ],
      })
    )

    await expect(
      createPaymentRefundRecord(ORDER_ID, {
        amountCents: 8000,
        reason: 'requested_by_customer',
      })
    ).rejects.toThrow('exceeds remaining refundable amount')
  })

  it('rejects zero or negative refund amounts', async () => {
    await expect(
      createPaymentRefundRecord(ORDER_ID, {
        amountCents: 0,
        reason: 'requested_by_customer',
      })
    ).rejects.toThrow('positive integer cents value')
  })

  it('marks order/payment as PARTIALLY_REFUNDED for partial refunds', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(buildOrder())
    mocks.prisma.refund.create.mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      status: 'PENDING',
      amountCents: 4000,
      items: [],
    })
    mocks.createStripeRefund.mockResolvedValue({ id: 're_stripe_1' })
    mocks.prisma.refund.update.mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      status: 'ISSUED',
      amountCents: 4000,
      items: [],
    })

    await createPaymentRefundRecord(ORDER_ID, {
      amountCents: 4000,
      reason: 'requested_by_customer',
    })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_REFUNDED' } })
    )
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'PARTIALLY_REFUNDED' } })
    )
  })

  it('marks order/payment as REFUNDED for full refunds', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(buildOrder())
    mocks.prisma.refund.create.mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      status: 'PENDING',
      amountCents: 10000,
      items: [],
    })
    mocks.createStripeRefund.mockResolvedValue({ id: 're_stripe_1' })
    mocks.prisma.refund.update.mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      status: 'ISSUED',
      amountCents: 10000,
      items: [],
    })

    await createPaymentRefundRecord(ORDER_ID, {
      amountCents: 10000,
      reason: 'requested_by_customer',
    })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REFUNDED' } })
    )
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'REFUNDED' } })
    )
  })

  it('marks pending refunds as FAILED when provider refund creation fails', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(buildOrder())
    mocks.prisma.refund.create.mockResolvedValue({
      id: REFUND_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      status: 'PENDING',
      amountCents: 4000,
      items: [],
    })
    mocks.createStripeRefund.mockRejectedValue(new Error('Stripe unavailable'))

    await expect(
      createPaymentRefundRecord(ORDER_ID, {
        amountCents: 4000,
        reason: 'requested_by_customer',
      })
    ).rejects.toThrow('Provider refund failed before issuing')

    expect(mocks.prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REFUND_ID },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    )
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled()
    expect(mocks.prisma.order.update).not.toHaveBeenCalled()
  })
})

describe('createReturnRecord', () => {
  it('creates a return record with validated item quantities', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(buildOrder())
    mocks.prisma.return.create.mockResolvedValue({
      id: RETURN_ID,
      orderId: ORDER_ID,
      status: 'REQUESTED',
      reason: 'Damaged',
      note: null,
      items: [
        {
          id: 'return-item-1',
          orderItemId: ORDER_ITEM_ID,
          variantId: VARIANT_ID,
          quantity: 1,
          reason: 'Damaged',
        },
      ],
      refund: null,
    })

    const result = await createReturnRecord(ORDER_ID, {
      reason: 'Damaged',
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1, variantId: VARIANT_ID, reason: 'Damaged' }],
    })

    expect(mocks.prisma.return.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: ORDER_ID,
          reason: 'Damaged',
          status: 'REQUESTED',
        }),
      })
    )
    expect(result.id).toBe(RETURN_ID)
  })

  it('rejects return quantities above remaining eligible quantity', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(
      buildOrder({
        returns: [
          {
            id: RETURN_ID,
            refundId: null,
            status: 'REQUESTED',
            reason: 'Damaged',
            note: null,
            receivedAt: null,
            createdAt: new Date(),
            items: [
              {
                id: 'return-item-1',
                orderItemId: ORDER_ITEM_ID,
                variantId: VARIANT_ID,
                quantity: 2,
                reason: 'Damaged',
              },
            ],
          },
        ],
      })
    )

    await expect(
      createReturnRecord(ORDER_ID, {
        reason: 'Second return',
        items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1 }],
      })
    ).rejects.toThrow('remaining eligible quantity')
  })
})

describe('updateReturnRecord audit logging', () => {
  function buildExistingReturn(overrides: Record<string, unknown> = {}) {
    return {
      id: RETURN_ID,
      orderId: ORDER_ID,
      status: 'REQUESTED',
      reason: 'Damaged',
      note: null,
      receivedAt: null,
      refundId: null,
      items: [{ id: 'return-item-1', orderItemId: ORDER_ITEM_ID, quantity: 1 }],
      refund: null,
      order: {
        id: ORDER_ID,
        orderNumber: ORDER_NUMBER,
      },
      ...overrides,
    }
  }

  it('emits transition audit on successful status change', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue(buildExistingReturn())
    mocks.prisma.return.update.mockResolvedValue(
      buildExistingReturn({ status: 'APPROVED', items: [{ id: 'return-item-1' }] })
    )

    const result = await updateReturnRecord(RETURN_ID, {
      status: 'APPROVED',
      actor: {
        actorType: 'STAFF',
        actorId: 'admin-1',
        actorEmail: 'admin@example.com',
        actorRole: 'OWNER',
      },
    })

    expect(result.status).toBe('APPROVED')
    expect(mocks.safeAuditReturnEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'return.approved',
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        previousStatus: 'REQUESTED',
        newStatus: 'APPROVED',
        itemCount: 1,
      })
    )
  })

  it('emits closed_with_refund linkage audit when requested', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue(
      buildExistingReturn({ status: 'RECEIVED', refundId: 'refund-1' })
    )
    mocks.prisma.return.update.mockResolvedValue(
      buildExistingReturn({
        status: 'CLOSED',
        refundId: 'refund-1',
        items: [{ id: 'return-item-1' }],
      })
    )

    await updateReturnRecord(RETURN_ID, {
      status: 'CLOSED',
      refundId: 'refund-1',
      auditClosedWithRefund: true,
    })

    expect(mocks.safeAuditReturnEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'return.closed_with_refund',
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        previousStatus: 'RECEIVED',
        newStatus: 'CLOSED',
        refundId: 'refund-1',
      })
    )
  })

  it('does not fail return update flow when audit logging throws', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue(buildExistingReturn())
    mocks.prisma.return.update.mockResolvedValue(
      buildExistingReturn({ status: 'APPROVED', items: [{ id: 'return-item-1' }] })
    )
    mocks.safeAuditReturnEvent.mockRejectedValue(new Error('audit unavailable'))

    const updated = await updateReturnRecord(RETURN_ID, { status: 'APPROVED' })
    expect(updated.status).toBe('APPROVED')
  })

  it('keeps audit payload free of provider/private keys', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue(buildExistingReturn())
    mocks.prisma.return.update.mockResolvedValue(
      buildExistingReturn({
        status: 'APPROVED',
        reason: 'Wrong item',
        note: 'Customer selected wrong size',
        items: [{ id: 'return-item-1' }],
      })
    )

    await updateReturnRecord(RETURN_ID, { status: 'APPROVED' })

    const serialized = JSON.stringify(mocks.safeAuditReturnEvent.mock.calls)
    expect(serialized).not.toContain('stripe')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('rawPayload')
    expect(serialized).not.toContain('rawResponse')
  })
})

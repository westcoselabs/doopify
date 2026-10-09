import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORDER_ID = 'order-1'
const RETURN_ID = 'ret-1'
const ORDER_ITEM_ID = 'oi-1'
const VARIANT_ID = 'var-1'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: { findUnique: vi.fn() },
    return: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    orderEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  emitInternalEvent: vi.fn(),
  issueRefund: vi.fn(),
  safeAuditReturnEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/events/outbox', () => ({
  enqueueCommerceEvent: (_tx: unknown, event: unknown, payload: unknown) => mocks.emitInternalEvent(event, payload),
}))

vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: mocks.emitInternalEvent }))
vi.mock('@/server/services/refund.service', () => ({ issueRefund: mocks.issueRefund }))
vi.mock('@/server/services/return-audit.service', () => ({ safeAuditReturnEvent: mocks.safeAuditReturnEvent }))

import { closeReturnWithRefund, createReturn, getOrderReturns, updateReturnStatus } from './return.service'

const baseOrder = {
  id: ORDER_ID,
  orderNumber: 1001,
  paymentStatus: 'PAID',
  items: [{ id: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 2 }],
}

const baseReturn = {
  id: RETURN_ID,
  orderId: ORDER_ID,
  status: 'REQUESTED' as const,
  reason: 'Wrong size',
  note: null,
  refundId: null,
  refund: null,
  receivedAt: null,
  items: [{ id: 'return-item-1', returnId: RETURN_ID, orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 1, reason: null }],
  order: { orderNumber: 1001 },
}

function setupTx() {
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma))
}

beforeEach(() => {
  vi.clearAllMocks()
  setupTx()
  mocks.safeAuditReturnEvent.mockResolvedValue(undefined)
})

describe('createReturn', () => {
  it('creates a return with validated order items and emits an event', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.prisma.return.create.mockResolvedValue(baseReturn)
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)

    const result = await createReturn({
      orderId: ORDER_ID,
      reason: 'Wrong size',
      items: [{ orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 1 }],
    })

    expect(mocks.prisma.return.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: ORDER_ID,
          status: 'REQUESTED',
          items: expect.objectContaining({ create: [expect.objectContaining({ orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID })] }),
        }),
      })
    )
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('order.return_requested', expect.objectContaining({ returnId: RETURN_ID }))
    expect(result.id).toBe(RETURN_ID)
  })

  it('throws when a return item is not on the order', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)

    await expect(
      createReturn({ orderId: ORDER_ID, items: [{ orderItemId: 'missing-item', quantity: 1 }] })
    ).rejects.toThrow('Return item does not belong to this order')
  })

  it('throws for unpaid orders', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({ ...baseOrder, paymentStatus: 'PENDING' })

    await expect(
      createReturn({ orderId: ORDER_ID, items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1 }] })
    ).rejects.toThrow('Returns can only be created for paid orders')
  })
})

describe('updateReturnStatus', () => {
  it('approves a requested return', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, order: { orderNumber: 1001 } })
    mocks.prisma.return.update.mockResolvedValue({ ...baseReturn, status: 'APPROVED', items: [], refund: null })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)

    const result = await updateReturnStatus(RETURN_ID, { status: 'APPROVED' })

    expect(result.status).toBe('APPROVED')
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('order.return_updated', expect.objectContaining({ returnId: RETURN_ID, status: 'APPROVED' }))
    expect(mocks.safeAuditReturnEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'return.approved',
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        previousStatus: 'REQUESTED',
        newStatus: 'APPROVED',
        itemCount: 0,
      })
    )
  })

  it('rejects an invalid state transition', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, order: { orderNumber: 1001 } })

    await expect(updateReturnStatus(RETURN_ID, { status: 'RECEIVED' })).rejects.toThrow('Cannot transition return from REQUESTED to RECEIVED')
  })

  it('sets receivedAt when transitioning to received', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, status: 'IN_TRANSIT', order: { orderNumber: 1001 } })
    mocks.prisma.return.update.mockResolvedValue({ ...baseReturn, status: 'RECEIVED', items: [], refund: null })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)

    await updateReturnStatus(RETURN_ID, { status: 'RECEIVED' })

    expect(mocks.prisma.return.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ receivedAt: expect.any(Date) }) }))
  })

  it('does not fail the return flow when audit emission throws', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, order: { orderNumber: 1001 } })
    mocks.prisma.return.update.mockResolvedValue({ ...baseReturn, status: 'APPROVED', items: [], refund: null })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)
    mocks.safeAuditReturnEvent.mockRejectedValue(new Error('audit storage unavailable'))

    const result = await updateReturnStatus(RETURN_ID, { status: 'APPROVED' })

    expect(result.status).toBe('APPROVED')
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith(
      'order.return_updated',
      expect.objectContaining({ returnId: RETURN_ID, status: 'APPROVED' })
    )
  })
})

describe('closeReturnWithRefund', () => {
  it('issues a refund and closes a received return', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, status: 'RECEIVED' })
    mocks.prisma.return.update.mockResolvedValue({ ...baseReturn, status: 'CLOSED' })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)
    mocks.issueRefund.mockResolvedValue({ id: 'refund-1', amountCents: 5000, status: 'ISSUED' })

    const result = await closeReturnWithRefund({
      returnId: RETURN_ID,
      paymentId: 'payment-1',
      amountCents: 5000,
      items: [{ orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 1, amountCents: 5000 }],
    })

    expect(mocks.issueRefund).toHaveBeenCalledWith(expect.objectContaining({ orderId: ORDER_ID, returnId: RETURN_ID, restockItems: true }))
    expect(result.refund.id).toBe('refund-1')
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

  it('rejects refund quantities greater than the returned quantity', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, status: 'RECEIVED' })

    await expect(
      closeReturnWithRefund({
        returnId: RETURN_ID,
        paymentId: 'payment-1',
        amountCents: 10000,
        items: [{ orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 2, amountCents: 10000 }],
      })
    ).rejects.toThrow('Refund item quantity exceeds returned quantity')

    expect(mocks.issueRefund).not.toHaveBeenCalled()
  })
})

describe('return audit payload safety', () => {
  it('emits transition audit snapshots without provider/private payload fields', async () => {
    mocks.prisma.return.findUnique.mockResolvedValue({ ...baseReturn, order: { orderNumber: 1001 } })
    mocks.prisma.return.update.mockResolvedValue({
      ...baseReturn,
      status: 'APPROVED',
      reason: 'Damaged packaging',
      note: 'Customer said item was defective',
      items: [{ id: 'return-item-1' }],
      refund: null,
    })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.emitInternalEvent.mockResolvedValue(undefined)

    await updateReturnStatus(RETURN_ID, { status: 'APPROVED' })

    const auditCalls = mocks.safeAuditReturnEvent.mock.calls as Array<[Record<string, unknown>]>
    const serialized = JSON.stringify(auditCalls)

    expect(serialized).not.toContain('stripe')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('rawPayload')
    expect(serialized).not.toContain('rawResponse')
  })
})

describe('getOrderReturns', () => {
  it('returns all returns for an order', async () => {
    mocks.prisma.return.findMany.mockResolvedValue([baseReturn])
    const result = await getOrderReturns(ORDER_ID)
    expect(result).toHaveLength(1)
    expect(mocks.prisma.return.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orderId: ORDER_ID } }))
  })
})

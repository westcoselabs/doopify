import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORDER_ID = 'order-1'
const PAYMENT_ID = 'pay-1'
const REFUND_ID = 'ref-1'
const STRIPE_REFUND_ID = 're_stripe_1'
const VARIANT_ID = 'var-1'
const ORDER_ITEM_ID = 'oi-1'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refund: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    return: {
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
  recordAuditLogBestEffort: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/stripe', () => ({ createStripeRefund: mocks.createStripeRefund }))
vi.mock('@/server/events/outbox', () => ({
  enqueueCommerceEvent: (_tx: unknown, event: unknown, payload: unknown) => mocks.emitInternalEvent(event, payload),
}))

vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: mocks.emitInternalEvent }))
vi.mock('@/server/services/audit-log.service', () => ({
  recordAuditLogBestEffort: mocks.recordAuditLogBestEffort,
}))

import { getOrderRefunds, getRefund, issueRefund } from './refund.service'

const baseOrder = {
  id: ORDER_ID,
  orderNumber: 1001,
  currency: 'USD',
  paymentStatus: 'PAID',
  items: [{ id: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 2, priceCents: 5000, totalCents: 10000 }],
  refunds: [],
}
const basePayment = {
  id: PAYMENT_ID,
  orderId: ORDER_ID,
  amountCents: 10000,
  stripePaymentIntentId: 'pi_test',
  stripeChargeId: 'ch_test',
  refunds: [],
}
const pendingRefund = {
  id: REFUND_ID,
  orderId: ORDER_ID,
  paymentId: PAYMENT_ID,
  stripeRefundId: null,
  status: 'PENDING',
  amountCents: 5000,
  reason: 'requested_by_customer',
  restockItems: false,
  items: [],
}
const issuedRefund = {
  ...pendingRefund,
  stripeRefundId: STRIPE_REFUND_ID,
  status: 'ISSUED',
}

function setupTx() {
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma))
}

function setupSuccess(overrides: { order?: unknown; payment?: unknown; refund?: unknown } = {}) {
  mocks.prisma.order.findUnique.mockResolvedValue(overrides.order ?? baseOrder)
  mocks.prisma.payment.findUnique.mockResolvedValue(overrides.payment ?? basePayment)
  mocks.prisma.refund.create.mockResolvedValue(overrides.refund ?? pendingRefund)
  mocks.createStripeRefund.mockResolvedValue({ id: STRIPE_REFUND_ID })
  mocks.prisma.refund.update.mockResolvedValue(issuedRefund)
  mocks.prisma.payment.update.mockResolvedValue({})
  mocks.prisma.order.update.mockResolvedValue({})
  mocks.prisma.orderEvent.create.mockResolvedValue({})
  mocks.prisma.productVariant.update.mockResolvedValue({})
  mocks.prisma.return.update.mockResolvedValue({})
  mocks.emitInternalEvent.mockResolvedValue(undefined)
  mocks.recordAuditLogBestEffort.mockResolvedValue(null)
}

const FORBIDDEN_AUDIT_SNAPSHOT_KEYS = [
  'stripeChargeId',
  'stripePaymentIntentId',
  'stripeRefundId',
  'card',
  'cardData',
  'rawResponse',
  'rawPayload',
  'body',
  'secret',
  'apiKey',
  'webhookSecret',
  'token',
  'password',
  'note',
] as const

function findForbiddenKey(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findForbiddenKey(entry)
      if (hit) return hit
    }
    return null
  }
  if (typeof value !== 'object') return null
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_AUDIT_SNAPSHOT_KEYS.includes(key as (typeof FORBIDDEN_AUDIT_SNAPSHOT_KEYS)[number])) {
      return key
    }
    const nested = findForbiddenKey(entry)
    if (nested) return nested
  }
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  setupTx()
})

describe('issueRefund', () => {
  it('creates a pending refund, calls Stripe idempotently, and marks it issued', async () => {
    setupSuccess()

    const result = await issueRefund({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountCents: 5000,
      reason: 'requested_by_customer',
    })

    expect(mocks.prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          amountCents: 5000,
        }),
      })
    )
    expect(mocks.createStripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, idempotencyKey: `refund:${REFUND_ID}` })
    )
    expect(mocks.prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REFUND_ID },
        data: expect.objectContaining({ status: 'ISSUED', stripeRefundId: STRIPE_REFUND_ID }),
      })
    )
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_REFUNDED' } })
    )
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('order.refunded', expect.objectContaining({
      refundId: REFUND_ID,
      amount: 50,
    }))
    expect(result.id).toBe(REFUND_ID)
  })

  it('marks payment as REFUNDED when full amount is refunded', async () => {
    setupSuccess({ payment: { ...basePayment, amountCents: 5000 } })

    await issueRefund({ orderId: ORDER_ID, paymentId: PAYMENT_ID, amountCents: 5000 })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REFUNDED' } })
    )
  })

  it('restocks validated inventory when restockItems is true', async () => {
    setupSuccess({
      refund: { ...pendingRefund, restockItems: true, items: [{ id: 'ri-1', refundId: REFUND_ID, orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 1, amountCents: 5000 }] },
    })
    mocks.prisma.refund.update.mockResolvedValue({ ...issuedRefund, restockItems: true })

    await issueRefund({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountCents: 5000,
      restockItems: true,
      items: [{ orderItemId: ORDER_ITEM_ID, variantId: VARIANT_ID, quantity: 1, amountCents: 5000 }],
    })

    expect(mocks.prisma.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VARIANT_ID },
        data: { inventory: { increment: 1 } },
      })
    )
  })

  it('links a refund to a return when returnId is provided', async () => {
    setupSuccess()

    await issueRefund({ orderId: ORDER_ID, paymentId: PAYMENT_ID, amountCents: 5000, returnId: 'ret-1' })

    expect(mocks.prisma.return.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ret-1' }, data: { refundId: REFUND_ID } })
    )
  })

  it('marks pending refund failed when Stripe fails before issuing', async () => {
    setupSuccess()
    mocks.createStripeRefund.mockRejectedValue(new Error('Stripe unavailable'))

    await expect(
      issueRefund({ orderId: ORDER_ID, paymentId: PAYMENT_ID, amountCents: 5000 })
    ).rejects.toThrow('Stripe refund failed before issuing')

    expect(mocks.prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REFUND_ID }, data: expect.objectContaining({ status: 'FAILED' }) })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled()
    expect(mocks.prisma.order.update).not.toHaveBeenCalled()
    expect(mocks.prisma.productVariant.update).not.toHaveBeenCalled()
  })

  it('throws when refund amount exceeds refundable amount', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.prisma.payment.findUnique.mockResolvedValue({
      ...basePayment,
      amountCents: 10000,
      refunds: [{ amountCents: 8000, status: 'ISSUED' }],
    })

    await expect(
      issueRefund({ orderId: ORDER_ID, paymentId: PAYMENT_ID, amountCents: 3000 })
    ).rejects.toThrow('exceeds refundable amount')
  })

  it('throws when refund item does not belong to the order', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.prisma.payment.findUnique.mockResolvedValue(basePayment)

    await expect(
      issueRefund({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amountCents: 1000,
        restockItems: true,
        items: [{ orderItemId: 'wrong-item', quantity: 1, amountCents: 1000 }],
      })
    ).rejects.toThrow('Refund item does not belong to this order')
  })

  it('throws when order is not found', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null)
    mocks.prisma.payment.findUnique.mockResolvedValue(basePayment)

    await expect(
      issueRefund({ orderId: 'missing', paymentId: PAYMENT_ID, amountCents: 1000 })
    ).rejects.toThrow('Order not found')
  })

  it('emits a refund.issued audit event with safe snapshot fields after success', async () => {
    setupSuccess()

    await issueRefund({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountCents: 5000,
      reason: 'requested_by_customer',
      note: 'free-text note that should never appear in audit',
      actor: {
        actorType: 'STAFF',
        actorId: 'user-1',
        actorEmail: 'admin@example.com',
        actorRole: 'OWNER',
      },
    })

    expect(mocks.recordAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refund.issued',
        actor: expect.objectContaining({
          actorType: 'STAFF',
          actorId: 'user-1',
          actorEmail: 'admin@example.com',
          actorRole: 'OWNER',
        }),
        resource: { type: 'Refund', id: REFUND_ID },
        snapshot: expect.objectContaining({
          outcome: 'issued',
          orderId: ORDER_ID,
          orderNumber: 1001,
          paymentId: PAYMENT_ID,
          refundId: REFUND_ID,
          amountCents: 5000,
          currency: 'USD',
          status: 'ISSUED',
          reason: 'requested_by_customer',
          restockItems: false,
          itemCount: 0,
          paymentStatus: 'PARTIALLY_REFUNDED',
        }),
      })
    )
  })

  it('emits a refund.attempt_failed audit event when Stripe fails before issuing', async () => {
    setupSuccess()
    mocks.createStripeRefund.mockRejectedValue(new Error('Stripe unavailable'))

    await expect(
      issueRefund({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amountCents: 5000,
        reason: 'requested_by_customer',
        actor: {
          actorType: 'STAFF',
          actorId: 'user-1',
          actorEmail: 'admin@example.com',
          actorRole: 'OWNER',
        },
      })
    ).rejects.toThrow('Stripe refund failed before issuing')

    expect(mocks.recordAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refund.attempt_failed',
        actor: expect.objectContaining({
          actorType: 'STAFF',
          actorId: 'user-1',
          actorEmail: 'admin@example.com',
          actorRole: 'OWNER',
        }),
        resource: { type: 'Refund', id: REFUND_ID },
        snapshot: expect.objectContaining({
          outcome: 'failed',
          orderId: ORDER_ID,
          orderNumber: 1001,
          paymentId: PAYMENT_ID,
          refundId: REFUND_ID,
          amountCents: 5000,
          currency: 'USD',
          status: 'FAILED',
          reason: 'requested_by_customer',
          restockItems: false,
          itemCount: 0,
          errorMessage: 'Stripe unavailable',
        }),
      })
    )
    // No refund.issued audit event when the Stripe call fails.
    const callActions = mocks.recordAuditLogBestEffort.mock.calls.map(
      (args: unknown[]) => (args[0] as { action: string }).action
    )
    expect(callActions).not.toContain('refund.issued')
  })

  it('completes the refund flow even when audit logging throws', async () => {
    setupSuccess()
    // Even if the underlying audit emitter rejects (which the production
    // best-effort wrapper already guards against), the refund service must
    // not surface that error to the caller and must not skip downstream
    // commerce-event emission.
    mocks.recordAuditLogBestEffort.mockRejectedValue(new Error('audit store unavailable'))

    const result = await issueRefund({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountCents: 5000,
      reason: 'requested_by_customer',
    })

    expect(result.id).toBe(REFUND_ID)
    expect(mocks.prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REFUND_ID },
        data: expect.objectContaining({ status: 'ISSUED', stripeRefundId: STRIPE_REFUND_ID }),
      })
    )
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_REFUNDED' } })
    )
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'PARTIALLY_REFUNDED' } })
    )
    // Downstream internal events must still fan out so analytics/outbound
    // webhooks see the refund, even though audit emission threw.
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith(
      'order.refunded',
      expect.objectContaining({ refundId: REFUND_ID })
    )
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith(
      'refund.issued',
      expect.objectContaining({ refundId: REFUND_ID })
    )
  })

  it('omits provider identifiers, raw bodies, and free-text notes from the audit snapshot', async () => {
    setupSuccess()

    await issueRefund({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amountCents: 5000,
      reason: 'requested_by_customer',
      note: 'sensitive free-text reason that must not be audited',
      actor: {
        actorType: 'STAFF',
        actorId: 'user-1',
        actorEmail: 'admin@example.com',
        actorRole: 'OWNER',
      },
    })

    const issuedCall = mocks.recordAuditLogBestEffort.mock.calls.find(
      (args: unknown[]) => (args[0] as { action: string }).action === 'refund.issued'
    )
    expect(issuedCall, 'refund.issued audit was not emitted').toBeTruthy()

    const auditInput = issuedCall![0] as {
      snapshot: Record<string, unknown>
      redactions?: string[]
    }

    const offendingKey = findForbiddenKey(auditInput.snapshot)
    expect(
      offendingKey,
      `audit snapshot must not include forbidden key ${offendingKey ?? ''}`
    ).toBeNull()

    // No serialized error blobs sneaking into the success snapshot.
    expect(JSON.stringify(auditInput.snapshot)).not.toContain('Stripe')
    expect(JSON.stringify(auditInput.snapshot)).not.toContain('sensitive free-text reason')

    // Redaction labels are present so reviewers see what was intentionally
    // excluded from the audit payload.
    expect(auditInput.redactions).toEqual(
      expect.arrayContaining([
        'card data',
        'Stripe response body',
        'provider secrets',
        'free-text refund note',
      ])
    )
  })

  it('omits provider identifiers and raw error payloads from the failed audit snapshot', async () => {
    setupSuccess()
    const longProviderError = new Error(
      `Stripe error: card_declined ${'x'.repeat(800)}`
    )
    mocks.createStripeRefund.mockRejectedValue(longProviderError)

    await expect(
      issueRefund({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amountCents: 5000,
        reason: 'requested_by_customer',
        note: 'never-audited free text',
      })
    ).rejects.toThrow('Stripe refund failed before issuing')

    const failedCall = mocks.recordAuditLogBestEffort.mock.calls.find(
      (args: unknown[]) => (args[0] as { action: string }).action === 'refund.attempt_failed'
    )
    expect(failedCall, 'refund.attempt_failed audit was not emitted').toBeTruthy()

    const auditInput = failedCall![0] as { snapshot: Record<string, unknown> }
    const offendingKey = findForbiddenKey(auditInput.snapshot)
    expect(
      offendingKey,
      `audit snapshot must not include forbidden key ${offendingKey ?? ''}`
    ).toBeNull()

    // The error message is captured but truncated. No raw Error object,
    // stack trace, or response body should land in the snapshot.
    const errorMessage = auditInput.snapshot.errorMessage
    expect(typeof errorMessage).toBe('string')
    expect((errorMessage as string).length).toBeLessThanOrEqual(503)
    expect(JSON.stringify(auditInput.snapshot)).not.toContain('never-audited free text')
  })
})

describe('getOrderRefunds', () => {
  it('returns all refunds for an order', async () => {
    mocks.prisma.refund.findMany.mockResolvedValue([issuedRefund])
    const result = await getOrderRefunds(ORDER_ID)
    expect(result).toHaveLength(1)
    expect(mocks.prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: ORDER_ID } })
    )
  })
})

describe('getRefund', () => {
  it('returns a single refund by id', async () => {
    mocks.prisma.refund.findUnique.mockResolvedValue(issuedRefund)
    const result = await getRefund(REFUND_ID)
    expect(result?.id).toBe(REFUND_ID)
  })
})

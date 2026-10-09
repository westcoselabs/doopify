import { type PaymentStatus, type Prisma } from '@prisma/client'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { createStripeRefund } from '@/lib/stripe'
import { enqueueCommerceEvent } from '@/server/events/outbox'
import {
  type AuditActor,
  recordAuditLogBestEffort,
} from '@/server/services/audit-log.service'

const REFUND_AUDIT_REDACTIONS = [
  'card data',
  'Stripe response body',
  'provider secrets',
  'free-text refund note',
] as const

const REFUND_ERROR_MESSAGE_MAX_LENGTH = 500

function truncateErrorMessage(value: unknown): string | null {
  if (value == null) return null
  const text = value instanceof Error ? value.message : String(value)
  if (!text) return null
  return text.length > REFUND_ERROR_MESSAGE_MAX_LENGTH
    ? `${text.slice(0, REFUND_ERROR_MESSAGE_MAX_LENGTH)}...`
    : text
}

/**
 * Defensive wrapper around the best-effort audit emitter. The audit service
 * already swallows persistence errors, but we wrap each call site so that a
 * future refactor of the audit layer (or an unexpected throw at the call
 * boundary itself) cannot stall the refund flow or skip downstream internal
 * event emission.
 */
async function safeAuditRefundEvent(
  input: Parameters<typeof recordAuditLogBestEffort>[0]
): Promise<void> {
  try {
    await recordAuditLogBestEffort(input)
  } catch (error) {
    console.error('[refund-service] Audit emission failed', {
      action: input.action,
      resource: input.resource,
      error,
    })
  }
}

function derivePaymentStatus(originalAmountCents: number, refundedAmountCents: number): PaymentStatus {
  return refundedAmountCents >= originalAmountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
}

export type IssueRefundInput = {
  orderId: string
  paymentId: string
  amountCents: number
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  note?: string
  restockItems?: boolean
  returnId?: string
  items?: Array<{
    orderItemId: string
    variantId?: string
    quantity: number
    amountCents: number
  }>
  /**
   * Optional admin actor captured from the calling route. Plumbed through to
   * audit logging so refund attempts can be traced to a specific staff/owner
   * user when initiated from an authenticated admin surface. Audit emission
   * defaults to the SYSTEM actor when this is omitted.
   */
  actor?: AuditActor | null
}

type ValidatedRefundItem = {
  orderItemId: string
  variantId?: string
  quantity: number
  amountCents: number
}

function validateRefundItems(input: {
  order: {
    items?: Array<{
      id: string
      variantId: string | null
      quantity: number
      totalCents: number
      priceCents: number
    }>
    refunds?: Array<{
      status: string
      items: Array<{ orderItemId: string; quantity: number }>
    }>
  }
  amountCents: number
  items: IssueRefundInput['items']
}) {
  const requestedItems = input.items ?? []
  if (!requestedItems.length) return []

  const orderItems = new Map((input.order.items ?? []).map((item) => [item.id, item]))
  const alreadyRefundedByItem = new Map<string, number>()

  for (const refund of input.order.refunds ?? []) {
    if (refund.status !== 'ISSUED' && refund.status !== 'PENDING') continue
    for (const item of refund.items ?? []) {
      alreadyRefundedByItem.set(
        item.orderItemId,
        (alreadyRefundedByItem.get(item.orderItemId) ?? 0) + item.quantity
      )
    }
  }

  let itemAmountTotalCents = 0
  const validated: ValidatedRefundItem[] = []

  for (const item of requestedItems) {
    const orderItem = orderItems.get(item.orderItemId)
    if (!orderItem) {
      throw new Error('Refund item does not belong to this order')
    }

    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Refund item quantity must be a positive integer')
    }

    const alreadyRefunded = alreadyRefundedByItem.get(item.orderItemId) ?? 0
    if (quantity > orderItem.quantity - alreadyRefunded) {
      throw new Error('Refund item quantity exceeds refundable quantity')
    }

    if (item.variantId && orderItem.variantId && item.variantId !== orderItem.variantId) {
      throw new Error('Refund item variant does not match the order item')
    }

    if (item.amountCents <= 0) {
      throw new Error('Refund item amount must be positive')
    }

    const maxItemAmountCents = Math.round(
      (orderItem.totalCents || orderItem.priceCents * orderItem.quantity) * (quantity / orderItem.quantity)
    )

    if (item.amountCents > maxItemAmountCents) {
      throw new Error('Refund item amount exceeds refundable item amount')
    }

    itemAmountTotalCents += item.amountCents
    validated.push({
      orderItemId: item.orderItemId,
      variantId: orderItem.variantId ?? item.variantId,
      quantity,
      amountCents: item.amountCents,
    })
  }

  if (itemAmountTotalCents > input.amountCents) {
    throw new Error('Refund item amounts exceed the refund amount')
  }

  return validated
}

export async function issueRefund(input: IssueRefundInput) {
  const {
    orderId,
    paymentId,
    amountCents,
    reason,
    note,
    restockItems = false,
    returnId,
    items = [],
    actor = null,
  } = input

  if (amountCents <= 0) {
    throw new Error('Refund amount must be positive')
  }

  const [order, payment] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        currency: true,
        paymentStatus: true,
        items: {
          select: { id: true, variantId: true, quantity: true, priceCents: true, totalCents: true },
        },
        refunds: {
          select: {
            status: true,
            items: { select: { orderItemId: true, quantity: true } },
          },
        },
      },
    }),
    prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orderId: true,
        amountCents: true,
        stripePaymentIntentId: true,
        stripeChargeId: true,
        refunds: { select: { amountCents: true, status: true } },
      },
    }),
  ])

  if (!order) throw new Error('Order not found')
  if (!payment) throw new Error('Payment not found')
  if (payment.orderId !== order.id) throw new Error('Payment does not belong to this order')
  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
    throw new Error('Only paid orders can be refunded')
  }

  const alreadyRefundedCents = payment.refunds
    .filter((r) => r.status === 'ISSUED' || r.status === 'PENDING')
    .reduce((sum, r) => sum + r.amountCents, 0)

  const refundableCents = payment.amountCents - alreadyRefundedCents
  if (amountCents > refundableCents) {
    throw new Error(
      `Refund amount ${centsToDollars(amountCents)} exceeds refundable amount ${centsToDollars(refundableCents)}`
    )
  }

  const validatedItems = validateRefundItems({ order, amountCents, items })

  const pendingRefund = await prisma.refund.create({
    data: {
      orderId,
      paymentId,
      status: 'PENDING',
      amountCents,
      reason,
      note,
      restockItems,
      items:
        validatedItems.length > 0
          ? {
              create: validatedItems.map((item) => ({
                orderItemId: item.orderItemId,
                variantId: item.variantId,
                quantity: item.quantity,
                amountCents: item.amountCents,
              })),
            }
          : undefined,
    },
    include: { items: true },
  })

  let stripeRefund: Awaited<ReturnType<typeof createStripeRefund>>
  try {
    stripeRefund = await createStripeRefund({
      chargeId: payment.stripeChargeId,
      paymentIntentId: payment.stripePaymentIntentId,
      amount: amountCents,
      reason,
      idempotencyKey: `refund:${pendingRefund.id}`,
    })
  } catch (error) {
    await prisma.refund.update({
      where: { id: pendingRefund.id },
      data: {
        status: 'FAILED',
        note: note
          ? `${note}\nStripe refund failed before issuing: ${error instanceof Error ? error.message : 'Unknown Stripe error'}`
          : `Stripe refund failed before issuing: ${error instanceof Error ? error.message : 'Unknown Stripe error'}`,
      },
    })

    await safeAuditRefundEvent({
      action: 'refund.attempt_failed',
      actor,
      resource: { type: 'Refund', id: pendingRefund.id },
      summary: `Stripe refund attempt failed for order ${order.orderNumber}`,
      snapshot: {
        outcome: 'failed',
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        refundId: pendingRefund.id,
        amountCents,
        currency: order.currency,
        status: 'FAILED',
        reason: reason ?? null,
        restockItems,
        itemCount: validatedItems.length,
        errorMessage: truncateErrorMessage(error),
      },
      redactions: [...REFUND_AUDIT_REDACTIONS],
    })

    throw new Error('Stripe refund failed before issuing')
  }

  const newPaymentStatus = derivePaymentStatus(payment.amountCents, alreadyRefundedCents + amountCents)

  const refund = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const issued = await tx.refund.update({
      where: { id: pendingRefund.id },
      data: {
        stripeRefundId: stripeRefund.id,
        status: 'ISSUED',
      },
      include: { items: true },
    })

    if (returnId) {
      await tx.return.update({
        where: { id: returnId },
        data: { refundId: issued.id },
      })
    }

    if (restockItems && validatedItems.length > 0) {
      for (const item of validatedItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { inventory: { increment: item.quantity } },
          })
        }
      }
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: newPaymentStatus },
    })

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: newPaymentStatus },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'refund.issued',
        title: 'Refund issued',
        detail: `Refunded ${order.currency} ${centsToDollars(amountCents)}${reason ? ` - ${reason.replace(/_/g, ' ')}` : ''}`,
        actorType: 'STAFF',
      },
    })

    await enqueueCommerceEvent(tx, 'order.refunded', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      refundId: issued.id,
      amount: centsToDollars(issued.amountCents),
      currency: order.currency,
    }, issued.id)

    await enqueueCommerceEvent(tx, 'refund.issued', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      refundId: issued.id,
      amount: centsToDollars(issued.amountCents),
      currency: order.currency,
    }, issued.id)

    return issued
  })

  await safeAuditRefundEvent({
    action: 'refund.issued',
    actor,
    resource: { type: 'Refund', id: refund.id },
    summary: `Refund ${refund.id} issued for order ${order.orderNumber}`,
    snapshot: {
      outcome: 'issued',
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      refundId: refund.id,
      amountCents: refund.amountCents,
      currency: order.currency,
      status: 'ISSUED',
      reason: reason ?? null,
      restockItems,
      itemCount: validatedItems.length,
      paymentStatus: newPaymentStatus,
    },
    redactions: [...REFUND_AUDIT_REDACTIONS],
  })

  return refund
}

export async function getOrderRefunds(orderId: string) {
  return prisma.refund.findMany({
    where: { orderId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getRefund(refundId: string) {
  return prisma.refund.findUnique({
    where: { id: refundId },
    include: { items: true },
  })
}

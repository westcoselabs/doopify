import { type PaymentStatus, type Prisma, type ReturnStatus } from '@prisma/client'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { createStripeRefund } from '@/lib/stripe'
import { enqueueCommerceEvent } from '@/server/events/outbox'
import type { AuditActor } from '@/server/services/audit-log.service'
import { safeAuditReturnEvent, type ReturnAuditAction } from '@/server/services/return-audit.service'

const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CLOSED']
const PAID_PAYMENT_STATUSES: PaymentStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']

const ALLOWED_RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'DECLINED'],
  APPROVED: ['IN_TRANSIT', 'DECLINED'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  DECLINED: [],
}

async function emitReturnAuditEventSafely(
  input: Parameters<typeof safeAuditReturnEvent>[0]
) {
  try {
    await safeAuditReturnEvent(input)
  } catch (error) {
    console.error('[order-adjustments] Return audit emission failed', {
      action: input.action,
      returnId: input.returnId,
      error,
    })
  }
}

type OrderAdjustmentOrder = NonNullable<Awaited<ReturnType<typeof loadOrderAdjustmentOrder>>>

export type CreateReturnRecordInput = {
  reason: string
  note?: string
  items: Array<{
    orderItemId: string
    variantId?: string
    quantity: number
    reason?: string
  }>
  actor?: AuditActor | null
}

export type UpdateReturnRecordInput = {
  status?: ReturnStatus
  reason?: string
  note?: string
  actor?: AuditActor | null
  refundId?: string | null
  auditClosedWithRefund?: boolean
}

export type CreatePaymentRefundRecordInput = {
  paymentId?: string
  amountCents: number
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  note?: string
  restockItems?: boolean
  returnId?: string
  items?: Array<{
    orderItemId: string
    variantId?: string
    quantity: number
    amountCents: number
  }>
}

function requireReason(value: string | undefined, label: 'return' | 'refund') {
  const reason = value?.trim()
  if (!reason) {
    throw new Error(`${label === 'return' ? 'Return' : 'Refund'} reason is required`)
  }
  return reason
}

function normalizePositiveInt(value: number, message: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(message)
  }
  return value
}

function isRecordedRefundStatus(status: string) {
  return status === 'PENDING' || status === 'ISSUED'
}

function sumRefundedQuantityByOrderItem(order: OrderAdjustmentOrder) {
  const refundedByItem = new Map<string, number>()
  for (const refund of order.refunds) {
    if (!isRecordedRefundStatus(refund.status)) continue
    for (const item of refund.items) {
      refundedByItem.set(item.orderItemId, (refundedByItem.get(item.orderItemId) ?? 0) + Number(item.quantity))
    }
  }
  return refundedByItem
}

function sumReturnedQuantityByOrderItem(order: OrderAdjustmentOrder) {
  const returnedByItem = new Map<string, number>()
  for (const returnRecord of order.returns) {
    if (!ACTIVE_RETURN_STATUSES.includes(returnRecord.status)) continue
    for (const item of returnRecord.items) {
      returnedByItem.set(item.orderItemId, (returnedByItem.get(item.orderItemId) ?? 0) + Number(item.quantity))
    }
  }
  return returnedByItem
}

function buildRemainingEligibleQuantityMap(order: OrderAdjustmentOrder) {
  const refundedByItem = sumRefundedQuantityByOrderItem(order)
  const returnedByItem = sumReturnedQuantityByOrderItem(order)
  const remainingByItem = new Map<string, number>()

  for (const item of order.items) {
    const purchasedQuantity = Number(item.quantity)
    const refundedQuantity = refundedByItem.get(item.id) ?? 0
    const returnedQuantity = returnedByItem.get(item.id) ?? 0
    const committedQuantity = Math.max(refundedQuantity, returnedQuantity)
    remainingByItem.set(item.id, Math.max(0, purchasedQuantity - committedQuantity))
  }

  return remainingByItem
}

function getRecordedRefundAmountCents(order: OrderAdjustmentOrder) {
  return order.refunds
    .filter((refund) => isRecordedRefundStatus(refund.status))
    .reduce((sum, refund) => sum + Number(refund.amountCents), 0)
}

function getPaidAmountCents(order: OrderAdjustmentOrder) {
  return order.payments
    .filter((payment) => PAID_PAYMENT_STATUSES.includes(payment.status))
    .reduce((sum, payment) => sum + Number(payment.amountCents), 0)
}

async function loadOrderAdjustmentOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      currency: true,
      paymentStatus: true,
      items: {
        select: {
          id: true,
          title: true,
          variantId: true,
          quantity: true,
          priceCents: true,
          totalCents: true,
        },
      },
      payments: {
        select: {
          id: true,
          amountCents: true,
          status: true,
          stripeChargeId: true,
          stripePaymentIntentId: true,
        },
      },
      refunds: {
        select: {
          id: true,
          paymentId: true,
          amountCents: true,
          status: true,
          reason: true,
          note: true,
          createdAt: true,
          stripeRefundId: true,
          items: {
            select: {
              id: true,
              orderItemId: true,
              variantId: true,
              quantity: true,
              amountCents: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      returns: {
        select: {
          id: true,
          refundId: true,
          status: true,
          reason: true,
          note: true,
          receivedAt: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              orderItemId: true,
              variantId: true,
              quantity: true,
              reason: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

export async function getOrderAdjustmentSummary(orderId: string) {
  const order = await loadOrderAdjustmentOrder(orderId)
  if (!order) {
    throw new Error('Order not found')
  }

  const paidAmountCents = getPaidAmountCents(order)
  const recordedRefundAmountCents = getRecordedRefundAmountCents(order)
  const remainingRefundableAmountCents = Math.max(0, paidAmountCents - recordedRefundAmountCents)
  const refundedByItem = sumRefundedQuantityByOrderItem(order)
  const returnedByItem = sumReturnedQuantityByOrderItem(order)
  const remainingByItem = buildRemainingEligibleQuantityMap(order)

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paidAmountCents,
    recordedRefundAmountCents,
    remainingRefundableAmountCents,
    orderItems: order.items.map((item) => ({
      orderItemId: item.id,
      title: item.title,
      variantId: item.variantId,
      purchasedQuantity: Number(item.quantity),
      refundedQuantity: refundedByItem.get(item.id) ?? 0,
      returnedQuantity: returnedByItem.get(item.id) ?? 0,
      remainingEligibleQuantity: remainingByItem.get(item.id) ?? 0,
      totalCents: Number(item.totalCents),
    })),
    returns: order.returns,
    refunds: order.refunds,
  }
}

export async function createReturnRecord(orderId: string, payload: CreateReturnRecordInput) {
  const reason = requireReason(payload.reason, 'return')

  if (!payload.items.length) {
    throw new Error('At least one return item is required')
  }

  const order = await loadOrderAdjustmentOrder(orderId)
  if (!order) {
    throw new Error('Order not found')
  }

  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
    throw new Error('Returns can only be created for paid orders')
  }

  const orderItemsById = new Map(order.items.map((item) => [item.id, item]))
  const remainingByItem = buildRemainingEligibleQuantityMap(order)

  const validatedItems = payload.items.map((item) => {
    const orderItem = orderItemsById.get(item.orderItemId)
    if (!orderItem) {
      throw new Error('Return item does not belong to this order')
    }

    const quantity = normalizePositiveInt(item.quantity, 'Return item quantity must be a positive integer')
    const remainingEligibleQuantity = remainingByItem.get(item.orderItemId) ?? 0
    if (quantity > remainingEligibleQuantity) {
      throw new Error('Return item quantity exceeds remaining eligible quantity')
    }

    if (item.variantId && orderItem.variantId && item.variantId !== orderItem.variantId) {
      throw new Error('Return item variant does not match the order item')
    }

    return {
      orderItemId: item.orderItemId,
      variantId: orderItem.variantId ?? item.variantId,
      quantity,
      reason: item.reason,
    }
  })

  const createdReturn = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.return.create({
      data: {
        orderId,
        reason,
        note: payload.note,
        status: 'REQUESTED',
        items: {
          create: validatedItems,
        },
      },
      include: { items: true, refund: true },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'return.requested',
        title: 'Return requested',
        detail: reason,
        actorType: 'STAFF',
      },
    })

    await enqueueCommerceEvent(tx, 'order.return_requested', {
      orderId,
      orderNumber: order.orderNumber,
      returnId: created.id,
    }, created.id)

    await enqueueCommerceEvent(tx, 'return.requested', {
      orderId,
      orderNumber: order.orderNumber,
      returnId: created.id,
    }, created.id)

    return created
  })

  await emitReturnAuditEventSafely({
    action: 'return.created',
    actor: payload.actor ?? null,
    returnId: createdReturn.id,
    orderId,
    orderNumber: order.orderNumber,
    previousStatus: null,
    newStatus: 'REQUESTED',
    reason: createdReturn.reason ?? reason,
    note: createdReturn.note ?? payload.note ?? null,
    itemCount: createdReturn.items.length,
  })

  return createdReturn
}

export async function updateReturnRecord(returnId: string, payload: UpdateReturnRecordInput) {
  const existing = await prisma.return.findUnique({
    where: { id: returnId },
    include: {
      items: true,
      refund: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
        },
      },
    },
  })

  if (!existing) {
    throw new Error('Return not found')
  }

  if (!payload.status && payload.reason == null && payload.note == null) {
    throw new Error('No return updates were provided')
  }

  if (payload.status) {
    const allowedTransitions = ALLOWED_RETURN_TRANSITIONS[existing.status]
    if (!allowedTransitions.includes(payload.status)) {
      throw new Error(`Cannot transition return from ${existing.status} to ${payload.status}`)
    }
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const next = await tx.return.update({
      where: { id: returnId },
      data: {
        status: payload.status,
        reason: payload.reason ?? undefined,
        note: payload.note ?? undefined,
        receivedAt:
          payload.status === 'RECEIVED' && existing.receivedAt == null ? new Date() : undefined,
      },
      include: { items: true, refund: true },
    })

    if (payload.status) {
      await tx.orderEvent.create({
        data: {
          orderId: existing.orderId,
          type: `return.${payload.status.toLowerCase()}`,
          title: `Return ${payload.status.toLowerCase().replace('_', ' ')}`,
          detail: payload.note ?? payload.reason ?? '',
          actorType: 'STAFF',
        },
      })
    }

    if (payload.status) {
      await enqueueCommerceEvent(tx, 'order.return_updated', {
        orderId: existing.orderId,
        orderNumber: existing.order.orderNumber,
        returnId: existing.id,
        status: payload.status,
      }, `${returnId}:${payload.status}`)

      if (payload.status === 'CLOSED') {
        await enqueueCommerceEvent(tx, 'return.closed', {
          orderId: existing.orderId,
          orderNumber: existing.order.orderNumber,
          returnId: existing.id,
        }, `${returnId}:${payload.status}`)
      }

    }
    return next
  })

  if (payload.status) {
    const statusToAction: Partial<Record<ReturnStatus, ReturnAuditAction>> = {
      APPROVED: 'return.approved',
      DECLINED: 'return.declined',
      IN_TRANSIT: 'return.marked_in_transit',
      RECEIVED: 'return.marked_received',
      CLOSED: 'return.closed',
    }

    const action = statusToAction[payload.status]
    if (action) {
      await emitReturnAuditEventSafely({
        action,
        actor: payload.actor ?? null,
        returnId: existing.id,
        orderId: existing.orderId,
        orderNumber: existing.order.orderNumber,
        previousStatus: existing.status,
        newStatus: updated.status,
        reason: updated.reason ?? payload.reason ?? null,
        note: updated.note ?? payload.note ?? null,
        itemCount: updated.items.length,
        refundId: payload.refundId ?? updated.refundId ?? null,
      })
    }

    if (payload.auditClosedWithRefund && payload.status === 'CLOSED' && (payload.refundId ?? updated.refundId)) {
      await emitReturnAuditEventSafely({
        action: 'return.closed_with_refund',
        actor: payload.actor ?? null,
        returnId: existing.id,
        orderId: existing.orderId,
        orderNumber: existing.order.orderNumber,
        previousStatus: existing.status,
        newStatus: updated.status,
        reason: updated.reason ?? payload.reason ?? null,
        note: updated.note ?? payload.note ?? null,
        itemCount: updated.items.length,
        refundId: payload.refundId ?? updated.refundId ?? null,
      })
    }
  }

  return updated
}

function resolveRefundPayment(order: OrderAdjustmentOrder, paymentId?: string) {
  if (paymentId) {
    const payment = order.payments.find((entry) => entry.id === paymentId)
    if (!payment) {
      throw new Error('Payment not found')
    }
    if (!PAID_PAYMENT_STATUSES.includes(payment.status)) {
      throw new Error('Payment is not eligible for provider refunds')
    }
    return payment
  }

  const fallbackPayment = order.payments.find(
    (entry) =>
      PAID_PAYMENT_STATUSES.includes(entry.status) &&
      Boolean(entry.stripeChargeId || entry.stripePaymentIntentId)
  )
  if (!fallbackPayment) {
    throw new Error('No provider-backed payment record exists for this order')
  }

  return fallbackPayment
}

function deriveRefundedPaymentStatus(remainingRefundableAmountCents: number): PaymentStatus {
  return remainingRefundableAmountCents === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
}

export async function createPaymentRefundRecord(orderId: string, payload: CreatePaymentRefundRecordInput) {
  requireReason(payload.reason, 'refund')
  normalizePositiveInt(payload.amountCents, 'Refund amount must be a positive integer cents value')

  const order = await loadOrderAdjustmentOrder(orderId)
  if (!order) {
    throw new Error('Order not found')
  }

  if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
    throw new Error('Only paid orders can be refunded')
  }

  const paidAmountCents = getPaidAmountCents(order)
  const recordedRefundAmountCents = getRecordedRefundAmountCents(order)
  const remainingRefundableAmountCents = Math.max(0, paidAmountCents - recordedRefundAmountCents)
  if (payload.amountCents > remainingRefundableAmountCents) {
    throw new Error(
      `Refund amount ${centsToDollars(payload.amountCents)} exceeds remaining refundable amount ${centsToDollars(remainingRefundableAmountCents)}`
    )
  }

  const orderItemsById = new Map(order.items.map((item) => [item.id, item]))
  const remainingByItem = buildRemainingEligibleQuantityMap(order)
  const validatedItems = (payload.items ?? []).map((item) => {
    const orderItem = orderItemsById.get(item.orderItemId)
    if (!orderItem) {
      throw new Error('Refund item does not belong to this order')
    }

    const quantity = normalizePositiveInt(item.quantity, 'Refund item quantity must be a positive integer')
    const remainingEligibleQuantity = remainingByItem.get(item.orderItemId) ?? 0
    if (quantity > remainingEligibleQuantity) {
      throw new Error('Refund item quantity exceeds remaining eligible quantity')
    }

    if (item.variantId && orderItem.variantId && item.variantId !== orderItem.variantId) {
      throw new Error('Refund item variant does not match the order item')
    }

    const amountCents = normalizePositiveInt(
      item.amountCents,
      'Refund item amount must be a positive integer cents value'
    )

    const maxItemAmountCents = Math.round(
      (Number(orderItem.totalCents) || Number(orderItem.priceCents) * Number(orderItem.quantity)) *
        (quantity / Number(orderItem.quantity))
    )

    if (amountCents > maxItemAmountCents) {
      throw new Error('Refund item amount exceeds eligible item amount')
    }

    return {
      orderItemId: item.orderItemId,
      variantId: orderItem.variantId ?? item.variantId,
      quantity,
      amountCents,
    }
  })

  const itemAmountTotalCents = validatedItems.reduce((sum, item) => sum + item.amountCents, 0)
  if (itemAmountTotalCents > payload.amountCents) {
    throw new Error('Refund item amounts exceed the refund amount')
  }

  if (payload.restockItems && validatedItems.length === 0) {
    throw new Error('Restocking requires at least one refund item')
  }

  if (payload.restockItems && validatedItems.some((item) => !item.variantId)) {
    throw new Error('Cannot restock refund items without variant IDs')
  }

  const payment = resolveRefundPayment(order, payload.paymentId)
  if (!payment.stripeChargeId && !payment.stripePaymentIntentId) {
    throw new Error('Provider refund requires stripeChargeId or stripePaymentIntentId')
  }

  const pendingRefund = await prisma.refund.create({
    data: {
      orderId,
      paymentId: payment.id,
      status: 'PENDING',
      amountCents: payload.amountCents,
      reason: payload.reason,
      note: payload.note,
      restockItems: Boolean(payload.restockItems),
      items: validatedItems.length
        ? {
            create: validatedItems,
          }
        : undefined,
    },
    include: { items: true },
  })

  let providerRefundId = ''
  try {
    const providerRefund = await createStripeRefund({
      chargeId: payment.stripeChargeId,
      paymentIntentId: payment.stripePaymentIntentId,
      amount: payload.amountCents,
      reason: payload.reason,
      idempotencyKey: `refund:${pendingRefund.id}`,
    })
    providerRefundId = providerRefund.id
  } catch (error) {
    await prisma.refund.update({
      where: { id: pendingRefund.id },
      data: {
        status: 'FAILED',
        note: payload.note
          ? `${payload.note}\nProvider refund failed before issuing: ${error instanceof Error ? error.message : 'Unknown provider error'}`
          : `Provider refund failed before issuing: ${error instanceof Error ? error.message : 'Unknown provider error'}`,
      },
    })
    throw new Error('Provider refund failed before issuing')
  }

  const remainingAfterIssueCents = Math.max(
    0,
    paidAmountCents - (recordedRefundAmountCents + payload.amountCents)
  )
  const nextPaymentStatus = deriveRefundedPaymentStatus(remainingAfterIssueCents)

  const issuedRefund = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const issued = await tx.refund.update({
      where: { id: pendingRefund.id },
      data: {
        status: 'ISSUED',
        stripeRefundId: providerRefundId,
      },
      include: { items: true },
    })

    if (payload.returnId) {
      await tx.return.update({
        where: { id: payload.returnId },
        data: { refundId: issued.id },
      })
    }

    if (payload.restockItems && validatedItems.length > 0) {
      for (const item of validatedItems) {
        await tx.productVariant.update({
          where: { id: item.variantId as string },
          data: { inventory: { increment: item.quantity } },
        })
      }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: nextPaymentStatus },
    })

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: nextPaymentStatus },
    })

    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'refund.issued',
        title: 'Refund issued',
        detail: `Refunded ${order.currency} ${centsToDollars(payload.amountCents)}${payload.reason ? ` - ${payload.reason.replaceAll('_', ' ')}` : ''}`,
        actorType: 'STAFF',
      },
    })

    await enqueueCommerceEvent(tx, 'order.refunded', {
      orderId,
      orderNumber: order.orderNumber,
      refundId: issued.id,
      amount: centsToDollars(issued.amountCents),
      currency: order.currency,
    }, issued.id)

    await enqueueCommerceEvent(tx, 'refund.issued', {
      orderId,
      orderNumber: order.orderNumber,
      refundId: issued.id,
      amount: centsToDollars(issued.amountCents),
      currency: order.currency,
    }, issued.id)

    return issued
  })

  return issuedRefund
}

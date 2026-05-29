// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

const mocks = vi.hoisted(() => ({
  createStripeRefund: vi.fn(),
}))

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    createStripeRefund: mocks.createStripeRefund,
  }
})

import { issueRefund } from './refund.service'
import { closeReturnWithRefund, createReturn, updateReturnStatus } from './return.service'

const runIntegration =
  process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
    ? describe
    : describe.skip

async function cleanTestData() {
  await prisma.analyticsEvent.deleteMany()
  await prisma.webhookDelivery.deleteMany()
  await prisma.shippingRate.deleteMany()
  await prisma.shippingZone.deleteMany()
  await prisma.taxRule.deleteMany()
  await prisma.discountApplication.deleteMany()
  await prisma.discount.deleteMany()
  await prisma.promotionApplicationLine.deleteMany()
  await prisma.promotionApplication.deleteMany()
  await prisma.promotionReward.deleteMany()
  await prisma.promotionQualifier.deleteMany()
  await prisma.promotion.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.return.deleteMany()
  await prisma.fulfillmentItem.deleteMany()
  await prisma.fulfillment.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderEvent.deleteMany()
  await prisma.orderAddress.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.checkoutSession.deleteMany()
  await prisma.customerAddress.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.collectionProduct.deleteMany()
  await prisma.collection.deleteMany()
  await prisma.productMedia.deleteMany()
  await prisma.mediaAsset.deleteMany()
  await prisma.productOptionValue.deleteMany()
  await prisma.productOption.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
  await prisma.store.deleteMany()
}

async function seedPaidOrder(input: {
  key: string
  inventory?: number
  quantity?: number
  price?: number
}) {
  const quantity = input.quantity ?? 2
  const price = input.price ?? 50
  const priceCents = Math.round(price * 100)
  const totalCents = quantity * priceCents

  const product = await prisma.product.create({
    data: {
      title: `Refund Test Product ${input.key}`,
      handle: `refund-test-product-${input.key}`,
      status: 'ACTIVE',
      variants: {
        create: {
          title: 'Default',
          sku: `REFUND-${input.key}`,
          priceCents,
          inventory: input.inventory ?? 3,
        },
      },
    },
    include: { variants: true },
  })

  const variant = product.variants[0]
  const order = await prisma.order.create({
    data: {
      email: `${input.key}@example.com`,
      status: 'OPEN',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      subtotalCents: totalCents,
      totalCents,
      currency: 'USD',
      channel: 'integration-test',
      items: {
        create: {
          productId: product.id,
          variantId: variant.id,
          title: product.title,
          variantTitle: variant.title,
          sku: variant.sku,
          priceCents,
          quantity,
          totalCents,
        },
      },
      payments: {
        create: {
          provider: 'stripe',
          amountCents: totalCents,
          currency: 'USD',
          status: 'PAID',
          stripePaymentIntentId: `pi_refund_${input.key}`,
          stripeChargeId: `ch_refund_${input.key}`,
        },
      },
      events: {
        create: {
          type: 'ORDER_PLACED',
          title: 'Order placed',
          actorType: 'SYSTEM',
        },
      },
    },
    include: {
      items: true,
      payments: true,
    },
  })

  return {
    product,
    variant,
    order,
    orderItem: order.items[0],
    payment: order.payments[0],
    totalCents,
  }
}

runIntegration('refund and return integration', () => {
  beforeEach(async () => {
    await cleanTestData()
    let refundOrdinal = 0
    mocks.createStripeRefund.mockReset()
    mocks.createStripeRefund.mockImplementation(async (input: { amount?: number }) => {
      refundOrdinal += 1
      return {
        id: `re_integration_${refundOrdinal}`,
        amount: input.amount ?? 0,
        currency: 'usd',
        status: 'succeeded',
      }
    })
  }, 60_000)

  afterAll(async () => {
    await cleanTestData()
    await prisma.$disconnect()
  }, 60_000)

  it('issues a partial refund, updates payment/order status, and restocks selected inventory after Stripe succeeds', async () => {
    const { order, orderItem, payment, variant } = await seedPaidOrder({ key: 'partial-restock' })

    const refund = await issueRefund({
      orderId: order.id,
      paymentId: payment.id,
      amountCents: 5000,
      reason: 'requested_by_customer',
      restockItems: true,
      items: [
        {
          orderItemId: orderItem.id,
          variantId: variant.id,
          quantity: 1,
          amountCents: 5000,
        },
      ],
    })

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    const persistedRefund = await prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
      include: { items: true },
    })

    expect(mocks.createStripeRefund).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000, idempotencyKey: `refund:${refund.id}` }))
    expect(updatedOrder.paymentStatus).toBe('PARTIALLY_REFUNDED')
    expect(updatedPayment.status).toBe('PARTIALLY_REFUNDED')
    expect(updatedVariant.inventory).toBe(4)
    expect(persistedRefund.status).toBe('ISSUED')
    expect(persistedRefund.amountCents).toBe(5000)
    expect(persistedRefund.items).toEqual([
      expect.objectContaining({ orderItemId: orderItem.id, variantId: variant.id, quantity: 1, amountCents: 5000 }),
    ])
  })

  it('marks a payment and order fully refunded when the remaining amount is refunded', async () => {
    const { order, payment } = await seedPaidOrder({ key: 'full-refund' })

    await issueRefund({
      orderId: order.id,
      paymentId: payment.id,
      amountCents: 10000,
      reason: 'requested_by_customer',
    })

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({
      paymentStatus: 'REFUNDED',
    })
    await expect(prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      status: 'REFUNDED',
    })
  })

  it('keeps a failed Stripe refund as FAILED without changing order, payment, or inventory state', async () => {
    const { order, orderItem, payment, variant } = await seedPaidOrder({ key: 'stripe-failure' })
    mocks.createStripeRefund.mockRejectedValueOnce(new Error('Stripe unavailable'))

    await expect(
      issueRefund({
        orderId: order.id,
        paymentId: payment.id,
        amountCents: 5000,
        restockItems: true,
        items: [{ orderItemId: orderItem.id, variantId: variant.id, quantity: 1, amountCents: 5000 }],
      })
    ).rejects.toThrow('Stripe refund failed before issuing')

    const refunds = await prisma.refund.findMany({ where: { orderId: order.id } })
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })

    expect(refunds).toEqual([expect.objectContaining({ status: 'FAILED', amountCents: 5000 })])
    expect(updatedOrder.paymentStatus).toBe('PAID')
    expect(updatedPayment.status).toBe('PAID')
    expect(updatedVariant.inventory).toBe(3)
  })

  it('moves a return through the state machine and closes it with a linked refund', async () => {
    const { order, orderItem, payment, variant } = await seedPaidOrder({ key: 'return-refund' })

    const returnRecord = await createReturn({
      orderId: order.id,
      reason: 'Wrong size',
      items: [{ orderItemId: orderItem.id, variantId: variant.id, quantity: 1, reason: 'Wrong size' }],
    })

    await updateReturnStatus(returnRecord.id, { status: 'APPROVED' })
    await updateReturnStatus(returnRecord.id, { status: 'IN_TRANSIT' })
    await updateReturnStatus(returnRecord.id, { status: 'RECEIVED' })

    const result = await closeReturnWithRefund({
      returnId: returnRecord.id,
      paymentId: payment.id,
      amountCents: 5000,
      items: [{ orderItemId: orderItem.id, variantId: variant.id, quantity: 1, amountCents: 5000 }],
    })

    const finalReturn = await prisma.return.findUniqueOrThrow({
      where: { id: returnRecord.id },
      include: { refund: true },
    })
    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })

    expect(result.refund.status).toBe('ISSUED')
    expect(finalReturn.status).toBe('CLOSED')
    expect(finalReturn.refundId).toBe(result.refund.id)
    expect(finalReturn.refund?.amountCents).toBe(5000)
    expect(updatedVariant.inventory).toBe(4)
    expect(updatedOrder.paymentStatus).toBe('PARTIALLY_REFUNDED')
  })
})

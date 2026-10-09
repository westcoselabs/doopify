// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

const mocks = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}))

vi.mock('@/server/email/provider', () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
  isTransactionalEmailConfigured: () => true,
}))

import {
  applyEmailProviderWebhookEvent,
  resendEmailDelivery,
  queueOrderConfirmationEmailDelivery,
  processOrderConfirmationEmailDeliveryJob,
} from './email-delivery.service'

const runIntegration =
  process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
    ? describe
    : describe.skip

const originalResendApiKey = process.env.RESEND_API_KEY

async function cleanTestData() {
  await prisma.job.deleteMany({ where: { type: { in: ['SEND_ORDER_CONFIRMATION_EMAIL', 'SEND_FULFILLMENT_EMAIL'] } } })
  await prisma.analyticsEvent.deleteMany()
  await prisma.emailDelivery.deleteMany()
  await prisma.discountApplication.deleteMany()
  await prisma.discount.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.return.deleteMany()
  await prisma.fulfillmentItem.deleteMany()
  await prisma.fulfillment.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderEvent.deleteMany()
  await prisma.orderAddress.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.customerAddress.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.productOptionValue.deleteMany()
  await prisma.productOption.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
  await prisma.store.deleteMany()
}

async function seedOrderForEmail(orderKey: string, recipientEmail: string) {
  const product = await prisma.product.create({
    data: {
      title: `Email Product ${orderKey}`,
      handle: `email-product-${orderKey}`,
      status: 'ACTIVE',
      variants: {
        create: {
          title: 'Default',
          sku: `EMAIL-${orderKey}`,
          priceCents: 2500,
          inventory: 100,
        },
      },
    },
    include: {
      variants: true,
    },
  })

  return prisma.order.create({
    data: {
      email: recipientEmail,
      paymentStatus: 'PAID',
      subtotalCents: 5000,
      shippingAmountCents: 0,
      taxAmountCents: 0,
      discountAmountCents: 0,
      totalCents: 5000,
      currency: 'USD',
      items: {
        create: {
          productId: product.id,
          variantId: product.variants[0].id,
          title: product.title,
          variantTitle: product.variants[0].title,
          sku: product.variants[0].sku,
          priceCents: 2500,
          quantity: 2,
          totalCents: 5000,
        },
      },
      addresses: {
        create: {
          type: 'SHIPPING',
          firstName: 'Ada',
          lastName: 'Lovelace',
          address1: '1 Compute Way',
          city: 'London',
          postalCode: 'N1 1AA',
          country: 'GB',
        },
      },
    },
  })
}

runIntegration('email delivery integration', () => {
  beforeEach(async () => {
    process.env.RESEND_API_KEY = ''
    mocks.sendTransactionalEmail.mockReset()
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'msg_sent' })
    await cleanTestData()
  }, 60_000)

  afterAll(async () => {
    await cleanTestData()
    if (originalResendApiKey == null) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey
    }
    await prisma.$disconnect()
  }, 60_000)

  it('resends failed order-confirmation deliveries as a new tracked delivery without duplicating commerce records', async () => {
    await prisma.store.create({
      data: {
        name: 'Integration Store',
        email: 'orders@example.com',
      },
    })

    const order = await seedOrderForEmail('resend-safe', 'customer@example.com')
    const originalDelivery = await prisma.emailDelivery.create({
      data: {
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'customer@example.com',
        subject: `Order #${order.orderNumber} confirmation`,
        status: 'FAILED',
        provider: 'resend',
        providerMessageId: 'msg_original',
        attempts: 1,
        lastError: 'Mailbox unavailable',
        orderId: order.id,
      },
    })

    const beforeOrderCount = await prisma.order.count()
    const beforePaymentCount = await prisma.payment.count()
    const beforeRefundCount = await prisma.refund.count()
    const beforeReturnCount = await prisma.return.count()
    const beforeInboundWebhookCount = await prisma.webhookDelivery.count()
    const beforeOutboundWebhookCount = await prisma.outboundWebhookDelivery.count()

    const resendResult = await resendEmailDelivery(originalDelivery.id)
    expect(resendResult.success).toBe(true)
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledTimes(1)

    const deliveries = await prisma.emailDelivery.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    })

    expect(deliveries).toHaveLength(2)
    expect(deliveries[0].id).toBe(originalDelivery.id)
    expect(deliveries[0].status).toBe('FAILED')
    expect(deliveries[1].id).not.toBe(originalDelivery.id)
    expect(deliveries[1].status).toBe('SENT')
    expect(deliveries[1].providerMessageId).toBe('msg_sent')
    expect(deliveries[1].attempts).toBe(1)

    expect(await prisma.order.count()).toBe(beforeOrderCount)
    expect(await prisma.payment.count()).toBe(beforePaymentCount)
    expect(await prisma.refund.count()).toBe(beforeRefundCount)
    expect(await prisma.return.count()).toBe(beforeReturnCount)
    expect(await prisma.webhookDelivery.count()).toBe(beforeInboundWebhookCount)
    expect(await prisma.outboundWebhookDelivery.count()).toBe(beforeOutboundWebhookCount)
  })

  it('updates only the targeted delivery status from provider webhook events', async () => {
    const delivery = await prisma.emailDelivery.create({
      data: {
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'customer@example.com',
        subject: 'Order confirmation',
        status: 'SENT',
        provider: 'resend',
        providerMessageId: 'msg_provider',
        attempts: 1,
      },
    })
    const siblingDelivery = await prisma.emailDelivery.create({
      data: {
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'other@example.com',
        subject: 'Order confirmation',
        status: 'SENT',
        provider: 'resend',
        providerMessageId: 'msg_provider',
        attempts: 1,
      },
    })
    const complainedTarget = await prisma.emailDelivery.create({
      data: {
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'customer@example.com',
        subject: 'Order confirmation',
        status: 'SENT',
        provider: 'resend',
        providerMessageId: 'msg_provider_complaint',
        attempts: 1,
      },
    })

    const bounced = await applyEmailProviderWebhookEvent({
      type: 'email.bounced',
      created_at: '2026-04-28T18:00:00.000Z',
      data: {
        email_id: 'msg_provider',
        to: ['customer@example.com'],
        bounce: {
          message: 'Recipient mailbox unavailable',
        },
      },
    })
    expect(bounced).toEqual({ handled: true })

    const afterBounce = await prisma.emailDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })
    const siblingAfterBounce = await prisma.emailDelivery.findUniqueOrThrow({
      where: { id: siblingDelivery.id },
    })
    expect(afterBounce.status).toBe('BOUNCED')
    expect(afterBounce.lastError).toBe('Recipient mailbox unavailable')
    expect(afterBounce.bouncedAt).toBeInstanceOf(Date)
    expect(siblingAfterBounce.status).toBe('SENT')
    expect(siblingAfterBounce.bouncedAt).toBeNull()

    const complained = await applyEmailProviderWebhookEvent({
      type: 'email.complained',
      created_at: '2026-04-28T18:05:00.000Z',
      data: {
        email_id: 'msg_provider_complaint',
        to: ['customer@example.com'],
      },
    })
    expect(complained).toEqual({ handled: true })

    const complainedAfter = await prisma.emailDelivery.findUniqueOrThrow({
      where: { id: complainedTarget.id },
    })
    const originalAfterComplaint = await prisma.emailDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })
    expect(complainedAfter.status).toBe('COMPLAINED')
    expect(complainedAfter.complainedAt).toBeInstanceOf(Date)
    expect(originalAfterComplaint.status).toBe('BOUNCED')
    expect(await prisma.emailDelivery.count()).toBe(3)
  })
  it('persists a delivery/job pair and permits only one send under concurrent execution', async () => {
    await prisma.store.create({ data: { name: 'Integration Store', email: 'orders@example.com' } })
    const order = await seedOrderForEmail('claimed-email', 'buyer@example.com')
    const { delivery, job } = await queueOrderConfirmationEmailDelivery({ orderId: order.id, orderNumber: order.orderNumber, email: order.email })
    expect(await prisma.emailDelivery.count({ where: { id: delivery.id } })).toBe(1)
    expect(await prisma.job.count({ where: { id: job.id, payload: { path: ['deliveryId'], equals: delivery.id } } })).toBe(1)
    const claim = { jobId: job.id, claimToken: 'email-integration-claim' }
    await prisma.job.update({ where: { id: job.id }, data: { status: 'RUNNING', claimToken: claim.claimToken, leaseExpiresAt: new Date(Date.now() + 120_000) } })
    await Promise.allSettled([
      processOrderConfirmationEmailDeliveryJob({ deliveryId: delivery.id }, claim),
      processOrderConfirmationEmailDeliveryJob({ deliveryId: delivery.id }, claim),
    ])
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledOnce()
    expect(await prisma.emailDelivery.findUnique({ where: { id: delivery.id } })).toMatchObject({ status: 'SENT', sendStartedAt: expect.any(Date) })
  })

  it('requires review for an interrupted send instead of repeating the provider request', async () => {
    const delivery = await prisma.emailDelivery.create({ data: { event: 'order.paid', template: 'order_confirmation', recipientEmail: 'buyer@example.com', subject: 'Order', provider: 'smtp', status: 'PENDING', sendStartedAt: new Date() } })
    const job = await prisma.job.create({ data: { type: 'SEND_ORDER_CONFIRMATION_EMAIL', payload: { deliveryId: delivery.id }, status: 'RUNNING', claimToken: 'email-recovery-claim', leaseExpiresAt: new Date(Date.now() + 120_000) } })
    await expect(processOrderConfirmationEmailDeliveryJob({ deliveryId: delivery.id }, { jobId: job.id, claimToken: job.claimToken })).rejects.toThrow('outcome is uncertain')
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.findUnique({ where: { id: delivery.id } })).toMatchObject({ status: 'FAILED', nextRetryAt: null, lastError: expect.stringContaining('Review provider delivery logs') })
  })

})

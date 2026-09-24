import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    emailDelivery: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
    fulfillment: {
      findUnique: vi.fn(),
    },
  },
  enqueueJob: vi.fn(),
  assertJobClaim: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  getOrderById: vi.fn(),
  getBuyerDigitalDownloadAvailabilityForPaidOrder: vi.fn(),
  buildOrderConfirmationEmailMessage: vi.fn(),
  buildFulfillmentTrackingEmailMessage: vi.fn(),
  emitInternalEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/email/provider', () => ({ sendTransactionalEmail: mocks.sendTransactionalEmail, isTransactionalEmailConfigured: () => true }))
vi.mock('@/server/jobs/job.service', () => ({ enqueueJob: mocks.enqueueJob, assertJobClaim: mocks.assertJobClaim, JobClaimLostError: class JobClaimLostError extends Error {}, PermanentJobError: class PermanentJobError extends Error {} }))
vi.mock('@/lib/env', () => ({ env: { EMAIL_PROVIDER: 'resend' } }))
vi.mock('@/server/services/order.service', () => ({ getOrderById: mocks.getOrderById }))
vi.mock('@/server/services/digital-download-delivery.service', () => ({
  getBuyerDigitalDownloadAvailabilityForPaidOrder: mocks.getBuyerDigitalDownloadAvailabilityForPaidOrder,
}))
vi.mock('@/server/services/email-template.service', () => ({
  buildOrderConfirmationEmailMessage: mocks.buildOrderConfirmationEmailMessage,
  buildFulfillmentTrackingEmailMessage: mocks.buildFulfillmentTrackingEmailMessage,
}))
vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

import {
  applyEmailProviderWebhookEvent,
  createEmailDelivery,
  EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES,
  getEmailDeliveryById,
  getEmailDeliveries,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  parseEmailProviderWebhookPayload,
  processOrderConfirmationEmailDeliveryJob,
  processFulfillmentTrackingEmailDeliveryJob,
  queueFulfillmentTrackingEmailDelivery,
  queueOrderConfirmationEmailDelivery,
  resendEmailDelivery,
  sendTrackedEmail,
} from './email-delivery.service'

const claim = { jobId: 'job-1', claimToken: 'claim-1' }

describe('email delivery service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma))
    mocks.assertJobClaim.mockResolvedValue(undefined)
    mocks.emitInternalEvent.mockResolvedValue(undefined)
    vi.useRealTimers()
    mocks.prisma.emailDelivery.create.mockResolvedValue({ id: 'email-1', status: 'PENDING' })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-1', status: 'SENT' })
    mocks.prisma.emailDelivery.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.emailDelivery.count.mockResolvedValue(1)
    mocks.prisma.emailDelivery.findMany.mockResolvedValue([{ id: 'email-1', status: 'SENT' }])
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue(null)
    mocks.prisma.order.findUnique.mockResolvedValue(null)
    mocks.prisma.fulfillment.findUnique.mockResolvedValue(null)
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', type: 'SEND_FULFILLMENT_EMAIL' })
    mocks.getOrderById.mockResolvedValue(null)
    mocks.getBuyerDigitalDownloadAvailabilityForPaidOrder.mockResolvedValue({
      hasDigitalItems: false,
      pending: false,
      downloads: [],
    })
    mocks.buildOrderConfirmationEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'Store order #1001 confirmation',
      html: '<p>Order confirmation</p>',
    })
    mocks.buildFulfillmentTrackingEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'Store shipping update',
      html: '<p>Shipping update</p>',
    })
  })

  it('creates a pending delivery record', async () => {
    await createEmailDelivery({
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      orderId: 'order-1',
    })

    expect(mocks.prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'customer@example.com',
        subject: 'Order confirmation',
        provider: 'resend',
        status: 'PENDING',
        orderId: 'order-1',
      }),
    })
  })

  it('marks a delivery sent with provider metadata', async () => {
    await markEmailDeliverySent({ deliveryId: 'email-1', provider: 'resend', providerMessageId: 'resend-1' })

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'email-1', status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
      data: expect.objectContaining({
        status: 'SENT',
        provider: 'resend',
        providerMessageId: 'resend-1',
        sentAt: expect.any(Date),
        lastError: null,
        attempts: { increment: 1 },
      }),
    })
  })

  it('marks a delivery failed without hiding provider errors', async () => {
    await markEmailDeliveryFailed({ deliveryId: 'email-1', error: new Error('Provider unavailable') })

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith({
      where: { id: 'email-1', status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'Provider unavailable',
        attempts: { increment: 1 },
        nextRetryAt: null,
      }),
    })
  })

  it('sends a tracked email and marks it sent', async () => {
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'resend-1' })

    await sendTrackedEmail({
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      from: 'orders@example.com',
      html: '<p>Confirmed</p>',
      orderId: 'order-1',
    })

    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith({
      from: 'orders@example.com',
      to: ['customer@example.com'],
      subject: 'Order confirmation',
      html: '<p>Confirmed</p>',
    })
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'resend-1' }),
    }))
  })

  it('marks a tracked email failed and rethrows provider errors', async () => {
    mocks.sendTransactionalEmail.mockRejectedValue(new Error('Resend failed'))

    await expect(sendTrackedEmail({
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      from: 'orders@example.com',
      html: '<p>Confirmed</p>',
      orderId: 'order-1',
    })).rejects.toThrow('Resend failed')

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', lastError: 'Resend failed' }),
    }))
  })

  it('lists safe delivery records with pagination', async () => {
    const result = await getEmailDeliveries({ status: 'SENT', page: 2, pageSize: 10 })

    expect(mocks.prisma.emailDelivery.count).toHaveBeenCalledWith({ where: { status: 'SENT' } })
    expect(mocks.prisma.emailDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'SENT' },
      skip: 10,
      take: 10,
    }))
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 })
  })

  it('queues fulfillment tracking email delivery when order email exists', async () => {
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      items: [],
      addresses: [],
    })
    mocks.prisma.emailDelivery.create.mockResolvedValue({ id: 'email-fulfillment-1', status: 'PENDING' })
    mocks.enqueueJob.mockResolvedValue({ id: 'job-fulfillment-1', type: 'SEND_FULFILLMENT_EMAIL' })

    const result = await queueFulfillmentTrackingEmailDelivery({
      orderId: 'order-1',
      fulfillmentId: 'ful-1',
    })

    expect(result).toEqual({
      delivery: { id: 'email-fulfillment-1', status: 'PENDING' },
      job: { id: 'job-fulfillment-1', type: 'SEND_FULFILLMENT_EMAIL' },
      skippedReason: null,
    })
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      'SEND_FULFILLMENT_EMAIL',
      expect.objectContaining({
        deliveryId: 'email-fulfillment-1',
        orderId: 'order-1',
        fulfillmentId: 'ful-1',
      }),
      expect.objectContaining({ maxAttempts: 5 }),
      mocks.prisma
    )
  })

  it('processes fulfillment tracking email job with tracked delivery semantics', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-fulfillment-1',
      event: 'fulfillment.created',
      template: 'fulfillment_tracking',
      recipientEmail: 'customer@example.com',
      subject: 'Order #1001 shipping update',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      items: [],
      addresses: [],
    })
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful-1',
      orderId: 'order-1',
      carrier: 'UPS',
      service: 'Ground',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.example.com/TRACK123',
      items: [
        {
          quantity: 1,
          orderItem: {
            title: 'Tee',
            variantTitle: 'Blue',
          },
        },
      ],
    })
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'resend-fulfillment-1' })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-fulfillment-1', status: 'SENT' })

    await processFulfillmentTrackingEmailDeliveryJob({
      deliveryId: 'email-fulfillment-1',
      fulfillmentId: 'ful-1',
      orderId: 'order-1',
    }, claim)

    expect(mocks.buildFulfillmentTrackingEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 1001,
        trackingNumber: 'TRACK123',
      })
    )
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith({
      from: 'orders@example.com',
      to: ['customer@example.com'],
      subject: 'Store shipping update',
      html: '<p>Shipping update</p>',
    })
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-fulfillment-1' , status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'resend-fulfillment-1',
        }),
      })
    )
  })

  it('returns delivery diagnostics with resend policy', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-1',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'FAILED',
      provider: 'resend',
      providerMessageId: null,
      attempts: 1,
      lastError: 'Bounce',
      nextRetryAt: null,
      sentAt: null,
      bouncedAt: null,
      complainedAt: null,
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    })
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      status: 'OPEN',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      total: 120,
      currency: 'USD',
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
    })

    const result = await getEmailDeliveryById('email-1')

    expect(result?.resendPolicy.canResend).toBe(true)
    expect(result?.resendPolicy.blockers).toEqual([])
    expect(result?.related.order).toEqual(expect.objectContaining({ id: 'order-1', orderNumber: 1001 }))
  })

  it('rejects resend when status is not eligible', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-1',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'SENT',
      provider: 'resend',
      providerMessageId: 'provider-1',
      attempts: 1,
      lastError: null,
      nextRetryAt: null,
      sentAt: new Date('2026-04-28T00:00:00.000Z'),
      bouncedAt: null,
      complainedAt: null,
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    })

    const result = await resendEmailDelivery('email-1')

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'NOT_RESENDABLE',
    }))
    expect(mocks.prisma.emailDelivery.create).not.toHaveBeenCalled()
  })

  it('resends an eligible order confirmation as a new tracked delivery', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-1',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'FAILED',
      provider: 'resend',
      providerMessageId: null,
      attempts: 1,
      lastError: 'Provider unavailable',
      nextRetryAt: null,
      sentAt: null,
      bouncedAt: null,
      complainedAt: null,
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      total: 120,
      items: [{ title: 'Tee', variantTitle: 'Blue', quantity: 2, price: 60 }],
      addresses: [{
        type: 'SHIPPING',
        firstName: 'Alex',
        lastName: 'Rivera',
        address1: '123 Main St',
        city: 'Los Angeles',
        province: 'CA',
        postalCode: '90001',
        country: 'US',
      }],
    })
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'resend-2' })
    mocks.prisma.emailDelivery.create.mockResolvedValue({ id: 'email-2', status: 'PENDING' })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-2', status: 'SENT' })

    const result = await resendEmailDelivery('email-1')

    expect(result).toEqual({
      success: true,
      delivery: { id: 'email-2', status: 'SENT' },
    })
    expect(mocks.buildOrderConfirmationEmailMessage).toHaveBeenCalled()
    expect(mocks.prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: 'order.paid',
        template: 'order_confirmation',
        recipientEmail: 'customer@example.com',
        provider: 'resend',
        status: 'PENDING',
      }),
    })
  })

  it('parses provider webhook payloads safely', () => {
    expect(parseEmailProviderWebhookPayload('{"type":"email.bounced","data":{"email_id":"msg_1"}}')).toEqual({
      type: 'email.bounced',
      data: { email_id: 'msg_1' },
    })
    expect(parseEmailProviderWebhookPayload('{"noType":true}')).toBeNull()
    expect(parseEmailProviderWebhookPayload('not json')).toBeNull()
  })

  it('marks a delivery bounced from provider webhook event', async () => {
    const result = await applyEmailProviderWebhookEvent({
      type: 'email.bounced',
      created_at: '2026-04-28T18:00:00.000Z',
      data: {
        email_id: 'provider-1',
        to: ['customer@example.com'],
        bounce: { message: 'Mailbox unavailable' },
      },
    })

    expect(result).toEqual({ handled: true })
    expect(mocks.prisma.emailDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        provider: 'resend',
        providerMessageId: 'provider-1',
        recipientEmail: 'customer@example.com',
      },
      data: expect.objectContaining({
        status: 'BOUNCED',
        lastError: 'Mailbox unavailable',
        nextRetryAt: null,
        bouncedAt: expect.any(Date),
      }),
    })
  })

  it('marks a delivery complained from provider webhook event', async () => {
    const result = await applyEmailProviderWebhookEvent({
      type: 'email.complained',
      created_at: '2026-04-28T18:05:00.000Z',
      data: {
        email_id: 'provider-2',
      },
    })

    expect(result).toEqual({ handled: true })
    expect(mocks.prisma.emailDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        provider: 'resend',
        providerMessageId: 'provider-2',
      },
      data: expect.objectContaining({
        status: 'COMPLAINED',
        lastError: 'Recipient reported this email as spam',
        nextRetryAt: null,
        complainedAt: expect.any(Date),
      }),
    })
  })

  it('ignores unsupported provider webhook events', async () => {
    const result = await applyEmailProviderWebhookEvent({
      type: 'email.delivered',
      data: {
        email_id: 'provider-3',
      },
    })

    expect(result).toEqual({ handled: false, reason: 'UNSUPPORTED_EVENT' })
    expect(mocks.prisma.emailDelivery.updateMany).not.toHaveBeenCalled()
  })

  // ── Order confirmation job: template-disabled and provider-missing paths ─────

  it('passes buyer-safe digital download links into order confirmation emails', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-oc-digital',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-digital-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-digital-1',
      orderNumber: 1010,
      email: 'customer@example.com',
      currency: 'USD',
      totalCents: 5000,
      items: [],
      addresses: [],
    })
    mocks.getBuyerDigitalDownloadAvailabilityForPaidOrder.mockResolvedValue({
      hasDigitalItems: true,
      pending: false,
      downloads: [
        {
          title: 'Guide',
          fileName: 'Guide.pdf',
          downloadUrl: 'https://store.example.com/api/digital-downloads/raw-token',
          expiresAt: new Date('2026-06-27T00:00:00.000Z'),
          downloadLimit: 5,
          downloadCount: 0,
        },
      ],
    })
    mocks.buildOrderConfirmationEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'Order #1010 confirmation',
      html: '<p>Digital links</p>',
    })
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'msg-order-digital' })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-oc-digital', status: 'SENT' })

    await processOrderConfirmationEmailDeliveryJob({
      deliveryId: 'email-oc-digital',
      orderId: 'order-digital-1',
    }, claim)

    expect(mocks.buildOrderConfirmationEmailMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-digital-1',
        digitalDownloads: [
          expect.objectContaining({
            downloadUrl: 'https://store.example.com/api/digital-downloads/raw-token',
          }),
        ],
        digitalDownloadsPending: false,
      })
    )
    expect(JSON.stringify(mocks.buildOrderConfirmationEmailMessage.mock.calls)).not.toContain('tokenHash')
    expect(JSON.stringify(mocks.buildOrderConfirmationEmailMessage.mock.calls)).not.toContain('storageKey')
  })

  it('marks order confirmation delivery FAILED when template is disabled (returns null)', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-oc-1',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      totalCents: 5000,
      items: [],
      addresses: [],
    })
    // Template disabled — builder returns null
    mocks.buildOrderConfirmationEmailMessage.mockResolvedValue(null)
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-oc-1', status: 'FAILED' })

    await processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-oc-1', orderId: 'order-1' }, claim)

    // Must mark FAILED, not leave PENDING
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-oc-1' , status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining('disabled'),
        }),
      })
    )
    // Must NOT attempt to send
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('marks order confirmation delivery FAILED when provider is explicit preview', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-oc-2',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      totalCents: 5000,
      items: [],
      addresses: [],
    })
    // Template enabled
    mocks.buildOrderConfirmationEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'Order #1001 confirmation',
      html: '<p>Confirmed</p>',
    })
    // Provider explicitly returns preview
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'preview', providerMessageId: undefined })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-oc-2', status: 'FAILED' })

    await processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-oc-2', orderId: 'order-1' }, claim)

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-oc-2' , status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining('preview'),
        }),
      })
    )
  })

  // ── Fulfillment tracking job: template-disabled and provider-missing paths ──

  it('marks fulfillment tracking delivery FAILED when template is disabled (returns null)', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-ful-1',
      event: 'fulfillment.created',
      template: 'fulfillment_tracking',
      recipientEmail: 'customer@example.com',
      subject: 'Shipping update',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      items: [],
      addresses: [],
    })
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful-1',
      orderId: 'order-1',
      carrier: 'UPS',
      service: 'Ground',
      trackingNumber: 'TRACK999',
      trackingUrl: 'https://track.example.com/TRACK999',
      items: [],
    })
    // Template disabled — builder returns null
    mocks.buildFulfillmentTrackingEmailMessage.mockResolvedValue(null)
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-ful-1', status: 'FAILED' })

    await processFulfillmentTrackingEmailDeliveryJob({
      deliveryId: 'email-ful-1',
      fulfillmentId: 'ful-1',
      orderId: 'order-1',
    }, claim)

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-ful-1' , status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining('disabled'),
        }),
      })
    )
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('marks fulfillment tracking delivery FAILED when provider is explicit preview', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-ful-2',
      event: 'fulfillment.created',
      template: 'fulfillment_tracking',
      recipientEmail: 'customer@example.com',
      subject: 'Shipping update',
      status: 'PENDING',
      provider: 'resend',
      orderId: 'order-1',
      customerId: null,
      refundId: null,
      returnId: null,
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      items: [],
      addresses: [],
    })
    mocks.prisma.fulfillment.findUnique.mockResolvedValue({
      id: 'ful-2',
      orderId: 'order-1',
      carrier: 'USPS',
      service: 'Priority',
      trackingNumber: 'USPS999',
      trackingUrl: 'https://track.example.com/USPS999',
      items: [],
    })
    mocks.buildFulfillmentTrackingEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'Order #1001 shipping update',
      html: '<p>Your order shipped</p>',
    })
    // Provider returns preview
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'preview', providerMessageId: undefined })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-ful-2', status: 'FAILED' })

    await processFulfillmentTrackingEmailDeliveryJob({
      deliveryId: 'email-ful-2',
      fulfillmentId: 'ful-2',
      orderId: 'order-1',
    }, claim)

    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-ful-2' , status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining('preview'),
        }),
      })
    )
  })

  // ── Resend: does not duplicate commerce side effects ─────────────────────────

  it('resend creates a new delivery record without touching order/payment/inventory', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({
      id: 'email-resend-1',
      event: 'order.paid',
      template: 'order_confirmation',
      recipientEmail: 'customer@example.com',
      subject: 'Order confirmation',
      status: 'FAILED',
      provider: 'resend',
      providerMessageId: null,
      attempts: 1,
      lastError: 'Resend API error',
      nextRetryAt: null,
      sentAt: null,
      bouncedAt: null,
      complainedAt: null,
      orderId: 'order-resend-1',
      customerId: null,
      refundId: null,
      returnId: null,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    })
    mocks.getOrderById.mockResolvedValue({
      id: 'order-resend-1',
      orderNumber: 2001,
      email: 'customer@example.com',
      currency: 'USD',
      totalCents: 7500,
      items: [{ title: 'Hat', variantTitle: null, quantity: 1, priceCents: 7500 }],
      addresses: [],
    })
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'resend', providerMessageId: 'msg-resend-2' })
    mocks.prisma.emailDelivery.create.mockResolvedValue({ id: 'email-resend-2', status: 'PENDING' })
    mocks.prisma.emailDelivery.update.mockResolvedValue({ id: 'email-resend-2', status: 'SENT' })

    const result = await resendEmailDelivery('email-resend-1')

    expect(result).toMatchObject({ success: true })

    // Only a new EmailDelivery record and a send are created — no order/payment/inventory writes.

    // Only an EmailDelivery record should be created — not any order/fulfillment/inventory record
    expect(mocks.prisma.emailDelivery.create).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.emailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          template: 'order_confirmation',
          status: 'PENDING',
        }),
      })
    )
  })

  // ── Delivery log DTO field safety ─────────────────────────────────────────────

  it('getEmailDeliveries select does not expose email HTML body or raw secrets', async () => {
    // Call the list endpoint and confirm the mock was called with a select that
    // excludes the html body, from address, and any raw provider payload fields.
    await getEmailDeliveries({ status: 'SENT' })

    const findManyCall = mocks.prisma.emailDelivery.findMany.mock.calls[0]?.[0]
    const select = findManyCall?.select

    // These fields would expose email content or secrets — must not be present
    expect(select?.html).toBeUndefined()
    expect(select?.from).toBeUndefined()
    expect(select?.rawResponse).toBeUndefined()
    expect(select?.apiKey).toBeUndefined()

    // Safe metadata fields must be present
    expect(select?.id).toBe(true)
    expect(select?.recipientEmail).toBe(true)
    expect(select?.status).toBe(true)
    expect(select?.template).toBe(true)
    expect(select?.provider).toBe(true)
    expect(select?.lastError).toBe(true)
  })

  it('resend eligible statuses are the correct subset', () => {
    // Contract: only failed, bounced, and complained deliveries may be resent
    expect(EMAIL_DELIVERY_RESEND_ELIGIBLE_STATUSES).toEqual(['FAILED', 'BOUNCED', 'COMPLAINED'])
  })
  it('creates confirmation delivery and job in the same transaction', async () => {
    await queueOrderConfirmationEmailDelivery({ orderId: 'order-1', orderNumber: 1001, email: 'buyer@example.com' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce()
    expect(mocks.enqueueJob).toHaveBeenCalledWith('SEND_ORDER_CONFIRMATION_EMAIL', expect.objectContaining({ deliveryId: 'email-1' }), expect.any(Object), mocks.prisma)
  })

  it('never sends when an earlier attempt has an uncertain outcome', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'email-1', status: 'PENDING', sendStartedAt: new Date(), orderId: 'order-1' })
    await expect(processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-1' }, claim)).rejects.toThrow('outcome is uncertain')
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', nextRetryAt: null, lastError: expect.stringContaining('explicitly resending') }) }))
  })

  it('never sends or writes when job ownership has changed', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'email-1', status: 'PENDING', sendStartedAt: null })
    mocks.assertJobClaim.mockRejectedValue(new Error('Job claim expired'))
    await expect(processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-1' }, claim)).rejects.toThrow('Job claim expired')
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
    expect(mocks.prisma.emailDelivery.update).not.toHaveBeenCalled()
  })

  it('leaves message preparation failures retryable before the send boundary', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'email-1', status: 'PENDING', sendStartedAt: null, orderId: 'order-1' })
    mocks.getOrderById.mockRejectedValue(new Error('temporary database outage'))
    await expect(processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-1' }, claim)).rejects.toThrow('temporary database outage')
    expect(mocks.prisma.emailDelivery.updateMany).not.toHaveBeenCalled()
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled()
  })

  it('stops a provider timeout permanently instead of sending again on retry', async () => {
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'email-1', status: 'PENDING', sendStartedAt: null, orderId: 'order-1', recipientEmail: 'buyer@example.com' })
    mocks.getOrderById.mockResolvedValue({ id: 'order-1', orderNumber: 1001, currency: 'USD', totalCents: 100, items: [], addresses: [] })
    mocks.sendTransactionalEmail.mockRejectedValue(new Error('SMTP connection timed out'))
    await expect(processOrderConfirmationEmailDeliveryJob({ deliveryId: 'email-1' }, claim)).rejects.toThrow('outcome is uncertain')
    expect(mocks.prisma.emailDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sendStartedAt: null }), data: expect.objectContaining({ sendStartedAt: expect.any(Date) }) }))
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', nextRetryAt: null }) }))
  })

  it('never downgrades a sent delivery when notification fan-out fails', async () => {
    mocks.sendTransactionalEmail.mockResolvedValue({ provider: 'smtp', providerMessageId: 'msg_1' })
    mocks.emitInternalEvent.mockRejectedValue(new Error('event fan-out unavailable'))
    const result = await sendTrackedEmail({ event: 'order.paid', template: 'order_confirmation', recipientEmail: 'buyer@example.com', subject: 'Order', from: 'orders@example.com', html: '<p>Order</p>' })
    expect(result.status).toBe('SENT')
    expect(mocks.prisma.emailDelivery.update.mock.calls.some(([arg]) => arg.data.status === 'FAILED')).toBe(false)
  })

  it('preserves terminal provider state when a stale failure write loses the race', async () => {
    mocks.prisma.emailDelivery.update.mockRejectedValue({ code: 'P2025' })
    mocks.prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'email-1', status: 'SENT' })
    const result = await markEmailDeliveryFailed({ deliveryId: 'email-1', error: 'uncertain attempt', claim })
    expect(result.status).toBe('SENT')
    expect(mocks.emitInternalEvent).not.toHaveBeenCalled()
    expect(mocks.prisma.emailDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'email-1', status: { notIn: ['SENT', 'BOUNCED', 'COMPLAINED'] } } }))
  })

})

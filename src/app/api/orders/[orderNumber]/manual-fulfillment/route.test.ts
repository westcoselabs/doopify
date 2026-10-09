import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
  },
  createManualFulfillment: vi.fn(),
  isTransactionalEmailConfigured: vi.fn(),
  auditActorFromUser: vi.fn(),
  recordAuditLogBestEffort: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/order.service', () => ({
  createManualFulfillment: mocks.createManualFulfillment,
}))

vi.mock('@/server/email/provider', () => ({
  isTransactionalEmailConfigured: mocks.isTransactionalEmailConfigured,
}))

vi.mock('@/server/services/audit-log.service', () => ({
  auditActorFromUser: mocks.auditActorFromUser,
  recordAuditLogBestEffort: mocks.recordAuditLogBestEffort,
}))

import { POST } from './route'

const validPayload = {
  carrier: 'UPS',
  service: 'Ground',
  trackingNumber: 'TRACK123',
  trackingUrl: 'https://tracking.example.com/TRACK123',
  items: [{ orderItemId: 'oi_1', variantId: 'var_1', quantity: 1 }],
}

describe('POST /api/orders/[orderNumber]/manual-fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auditActorFromUser.mockImplementation((user) => user)
    mocks.recordAuditLogBestEffort.mockResolvedValue(null)
    mocks.isTransactionalEmailConfigured.mockReturnValue(true)
  })

  it('requires admin authorization', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const response = await POST(
      new Request('http://localhost/api/orders/1001/manual-fulfillment', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }),
      { params: Promise.resolve({ orderNumber: '1001' }) }
    )

    expect(response.status).toBe(401)
    expect(mocks.createManualFulfillment).not.toHaveBeenCalled()
  })

  it('creates manual fulfillment for a valid admin request', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order_1', email: 'buyer@example.com' })
    mocks.createManualFulfillment.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/orders/1001/manual-fulfillment', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }),
      { params: Promise.resolve({ orderNumber: '1001' }) }
    )

    expect(response.status).toBe(201)
    expect(mocks.createManualFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order_1',
        carrier: 'UPS',
        service: 'Ground',
        trackingNumber: 'TRACK123',
        sendTrackingEmail: false,
      })
    )
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        trackingEmail: {
          requested: false,
          queued: false,
          skippedReason: 'NOT_REQUESTED',
        },
      },
    })
    expect(mocks.recordAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'fulfillment.manual_created',
      })
    )
  })

  it('queues tracking email when requested and email provider is configured', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order_1', email: 'buyer@example.com' })
    mocks.createManualFulfillment.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/orders/1001/manual-fulfillment', {
        method: 'POST',
        body: JSON.stringify({
          ...validPayload,
          sendTrackingEmail: true,
        }),
      }),
      { params: Promise.resolve({ orderNumber: '1001' }) }
    )

    expect(response.status).toBe(201)
    expect(mocks.createManualFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        sendTrackingEmail: true,
      })
    )
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        trackingEmail: {
          requested: true,
          queued: true,
          skippedReason: null,
        },
      },
    })
  })

  it('does not roll back manual tracking when email provider is unavailable', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.prisma.order.findUnique.mockResolvedValue({ id: 'order_1', email: 'buyer@example.com' })
    mocks.isTransactionalEmailConfigured.mockReturnValue(false)
    mocks.createManualFulfillment.mockResolvedValue({
      id: 'ful_1',
      orderId: 'order_1',
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/orders/1001/manual-fulfillment', {
        method: 'POST',
        body: JSON.stringify({
          ...validPayload,
          sendTrackingEmail: true,
        }),
      }),
      { params: Promise.resolve({ orderNumber: '1001' }) }
    )

    expect(response.status).toBe(201)
    expect(mocks.createManualFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        sendTrackingEmail: false,
      })
    )
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        trackingEmail: {
          requested: true,
          queued: false,
          skippedReason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        },
      },
    })
  })
})

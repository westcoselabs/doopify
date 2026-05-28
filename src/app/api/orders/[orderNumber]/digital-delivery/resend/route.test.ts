import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveOrderIdentifier: vi.fn(),
  resendOrderDigitalDownloads: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/order-identifier.service', async () => {
  const actual = await vi.importActual<typeof import('@/server/services/order-identifier.service')>(
    '@/server/services/order-identifier.service'
  )
  return {
    ...actual,
    resolveOrderIdentifier: mocks.resolveOrderIdentifier,
  }
})

vi.mock('@/server/services/digital-delivery-admin.service', () => ({
  resendOrderDigitalDownloads: mocks.resendOrderDigitalDownloads,
}))

import { POST } from './route'

describe('POST /api/orders/[orderNumber]/digital-delivery/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const response = await POST(new Request('http://localhost/api/orders/1001/digital-delivery/resend', {
      method: 'POST',
    }), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns queued resend result for admins', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'order_1', orderNumber: 1001 })
    mocks.resendOrderDigitalDownloads.mockResolvedValue({
      queued: true,
      orderId: 'order_1',
      orderNumber: 1001,
      emailDeliveryId: 'email_1',
      emailDeliveryStatus: 'PENDING',
      jobId: 'job_1',
      rotatedMissingDeliveryTokens: 0,
    })

    const response = await POST(new Request('http://localhost/api/orders/1001/digital-delivery/resend', {
      method: 'POST',
    }), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        queued: true,
        orderId: 'order_1',
        orderNumber: 1001,
        emailDeliveryId: 'email_1',
        emailDeliveryStatus: 'PENDING',
        jobId: 'job_1',
        rotatedMissingDeliveryTokens: 0,
      },
    })
  })

  it('returns a clean 409 when order has no customer email', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'order_1', orderNumber: 1001 })
    mocks.resendOrderDigitalDownloads.mockResolvedValue({
      queued: false,
      reason: 'MISSING_CUSTOMER_EMAIL',
      message: 'Order is missing a customer email address',
    })

    const response = await POST(new Request('http://localhost/api/orders/1001/digital-delivery/resend', {
      method: 'POST',
    }), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Order is missing a customer email address',
    })
  })
})

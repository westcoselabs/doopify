import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveOrderIdentifier: vi.fn(),
  getOrderDigitalDeliverySummary: vi.fn(),
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
  getOrderDigitalDeliverySummary: mocks.getOrderDigitalDeliverySummary,
}))

import { GET } from './route'
import { OrderIdentifierResolutionError } from '@/server/services/order-identifier.service'

describe('GET /api/orders/[orderNumber]/digital-delivery', () => {
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

    const response = await GET(new Request('http://localhost/api/orders/1001/digital-delivery'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(401)
    expect(mocks.resolveOrderIdentifier).not.toHaveBeenCalled()
  })

  it('returns digital delivery summary', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'order_1', orderNumber: 1001 })
    mocks.getOrderDigitalDeliverySummary.mockResolvedValue({
      orderId: 'order_1',
      orderNumber: 1001,
      hasDigitalItems: true,
      pending: false,
      deliveryEmailStatus: 'SENT',
      deliveryEmailLastSentAt: null,
      grants: [
        {
          grantId: 'grant_1',
          status: 'ACTIVE',
          downloadCount: 1,
          downloadLimit: 5,
        },
      ],
    })

    const response = await GET(new Request('http://localhost/api/orders/1001/digital-delivery'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        orderId: 'order_1',
        hasDigitalItems: true,
        grants: [{ grantId: 'grant_1', status: 'ACTIVE' }],
      },
    })
    expect(JSON.stringify(payload)).not.toContain('tokenHash')
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })

  it('returns safe invalid identifier errors', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockRejectedValue(
      new OrderIdentifierResolutionError('INVALID_IDENTIFIER', 'Invalid order identifier')
    )

    const response = await GET(new Request('http://localhost/api/orders/not-an-order/digital-delivery'), {
      params: Promise.resolve({ orderNumber: 'not-an-order' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid order identifier',
    })
  })
})

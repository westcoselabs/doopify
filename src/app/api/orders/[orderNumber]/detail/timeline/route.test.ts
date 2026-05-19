import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveOrderIdentifier: vi.fn(),
  getAdminOrderDetailTimelineByOrderNumber: vi.fn(),
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

vi.mock('@/server/services/admin-order-detail.service', () => ({
  getAdminOrderDetailTimelineByOrderNumber: mocks.getAdminOrderDetailTimelineByOrderNumber,
}))

import { GET } from './route'
import { OrderIdentifierResolutionError } from '@/server/services/order-identifier.service'

describe('GET /api/orders/[orderNumber]/detail/timeline', () => {
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

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/timeline'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(401)
    expect(mocks.resolveOrderIdentifier).not.toHaveBeenCalled()
  })

  it('returns timeline payload', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'ord_1', orderNumber: 1001 })
    mocks.getAdminOrderDetailTimelineByOrderNumber.mockResolvedValue({
      timeline: [{ id: 'evt_1', event: 'Order placed' }],
      events: [{ id: 'evt_1', event: 'Order placed' }],
      customerVisibleNotes: [],
    })

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/timeline'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        timeline: [{ id: 'evt_1', event: 'Order placed' }],
        events: [{ id: 'evt_1', event: 'Order placed' }],
        customerVisibleNotes: [],
      },
    })
  })

  it('returns safe invalid identifier message', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockRejectedValue(
      new OrderIdentifierResolutionError('INVALID_IDENTIFIER', 'Invalid order identifier')
    )

    const response = await GET(new Request('http://localhost/api/orders/not-an-order/detail/timeline'), {
      params: Promise.resolve({ orderNumber: 'not-an-order' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid order identifier',
    })
  })

  it('returns 404 when order identifier resolves but timeline lookup is missing', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'ord_1', orderNumber: 1001 })
    mocks.getAdminOrderDetailTimelineByOrderNumber.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/timeline'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Order not found',
    })
  })
})


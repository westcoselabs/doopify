import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getOrders: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/order.service', () => ({
  getOrders: mocks.getOrders,
}))

import { GET } from './route'

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/orders'))
    expect(response.status).toBe(403)
    expect(mocks.getOrders).not.toHaveBeenCalled()
  })

  it('passes payments activity view to getOrders when requested', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'admin_1', email: 'admin@example.com', role: 'ADMIN' },
    })
    mocks.getOrders.mockResolvedValue({
      orders: [],
      pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    })

    const response = await GET(
      new Request('http://localhost/api/orders?view=payments_activity&page=1&pageSize=12')
    )

    expect(response.status).toBe(200)
    expect(mocks.getOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'payments_activity',
        page: 1,
        pageSize: 12,
      })
    )
  })
})


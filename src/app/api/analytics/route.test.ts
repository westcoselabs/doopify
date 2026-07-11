import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/server/services/order.service', () => ({
  getAnalytics: mocks.getAnalytics,
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

import { GET } from './route'

describe('analytics route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the authorization response before querying analytics', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/analytics'))

    expect(response.status).toBe(401)
    expect(mocks.getAnalytics).not.toHaveBeenCalled()
  })

  it('returns analytics only after route authorization succeeds', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', email: 'staff@example.com', role: 'STAFF' },
    })
    mocks.getAnalytics.mockResolvedValue({ totalOrders: 4 })

    const response = await GET(new Request('http://localhost/api/analytics'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { totalOrders: 4 } })
  })
})

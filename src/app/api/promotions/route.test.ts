import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listPromotionsForAdmin: vi.fn(),
  createPromotionFromAdmin: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/promotions/admin-service', () => ({
  listPromotionsForAdmin: mocks.listPromotionsForAdmin,
  createPromotionFromAdmin: mocks.createPromotionFromAdmin,
}))

import { GET, POST } from './route'

describe('/api/promotions route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'owner_1', role: 'OWNER' } })
  })

  it('rejects unauthorized list and create requests', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const listResponse = await GET(new Request('http://localhost/api/promotions'))
    const createResponse = await POST(
      new Request('http://localhost/api/promotions', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )

    expect(listResponse.status).toBe(401)
    expect(createResponse.status).toBe(401)
    expect(mocks.listPromotionsForAdmin).not.toHaveBeenCalled()
    expect(mocks.createPromotionFromAdmin).not.toHaveBeenCalled()
  })

  it('returns promotion summaries with pagination', async () => {
    mocks.listPromotionsForAdmin.mockResolvedValue({
      promotions: [
        {
          id: 'promo_1',
          name: 'Promo 1',
          status: 'ACTIVE',
          type: 'PRODUCT_GROUP_DISCOUNT',
          rewardType: 'PERCENTAGE',
          value: 15,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
          usageCount: 0,
          priority: 100,
          qualifierCount: 1,
          rewardCount: 0,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    })

    const response = await GET(
      new Request('http://localhost/api/promotions?page=1&pageSize=20&status=active&type=product_group_discount')
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.listPromotionsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ACTIVE',
        type: 'PRODUCT_GROUP_DISCOUNT',
      })
    )
    expect(payload.success).toBe(true)
    expect(payload.data.pagination.total).toBe(1)
  })

  it('creates promotion and returns 422 when business validation fails', async () => {
    mocks.createPromotionFromAdmin.mockResolvedValue({
      ok: false,
      errors: [{ path: 'rewards', code: 'PRODUCT_GROUP_REWARDS_NOT_ALLOWED', message: 'nope' }],
      warnings: [],
    })

    const response = await POST(
      new Request('http://localhost/api/promotions', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Promo',
          type: 'PRODUCT_GROUP_DISCOUNT',
          rewardType: 'PERCENTAGE',
          value: 10,
          qualifiers: [{ variantId: 'var_1', requiredQuantity: 1 }],
          rewards: [{ variantId: 'var_2', rewardQuantity: 1 }],
        }),
      })
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid promotion payload',
    })
  })
})

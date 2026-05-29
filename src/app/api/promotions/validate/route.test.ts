import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  validatePromotionForAdmin: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/promotions/admin-service', () => ({
  validatePromotionForAdmin: mocks.validatePromotionForAdmin,
}))

import { POST } from './route'

describe('POST /api/promotions/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'owner_1', role: 'OWNER' } })
  })

  it('is admin-protected', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await POST(
      new Request('http://localhost/api/promotions/validate', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.validatePromotionForAdmin).not.toHaveBeenCalled()
  })

  it('returns 422 for invalid admin validation draft', async () => {
    mocks.validatePromotionForAdmin.mockResolvedValue({
      ok: false,
      errors: [{ path: 'value', code: 'INVALID_VALUE', message: 'invalid' }],
      warnings: [],
    })

    const response = await POST(
      new Request('http://localhost/api/promotions/validate', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Gift',
          type: 'FREE_GIFT',
          rewardType: 'FREE',
          value: 0,
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getPromotionForAdmin: vi.fn(),
  updatePromotionFromAdmin: vi.fn(),
  disablePromotionForAdmin: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/promotions/admin-service', () => ({
  getPromotionForAdmin: mocks.getPromotionForAdmin,
  updatePromotionFromAdmin: mocks.updatePromotionFromAdmin,
  disablePromotionForAdmin: mocks.disablePromotionForAdmin,
}))

import { DELETE, GET, PATCH } from './route'

describe('/api/promotions/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'owner_1', role: 'OWNER' } })
  })

  it('rejects unauthorized get/patch/delete requests', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const getResponse = await GET(new Request('http://localhost/api/promotions/promo_1'), {
      params: Promise.resolve({ id: 'promo_1' }),
    })
    const patchResponse = await PATCH(
      new Request('http://localhost/api/promotions/promo_1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'promo_1' }) }
    )
    const deleteResponse = await DELETE(new Request('http://localhost/api/promotions/promo_1'), {
      params: Promise.resolve({ id: 'promo_1' }),
    })

    expect(getResponse.status).toBe(401)
    expect(patchResponse.status).toBe(401)
    expect(deleteResponse.status).toBe(401)
  })

  it('returns full promotion detail payload', async () => {
    mocks.getPromotionForAdmin.mockResolvedValue({
      id: 'promo_1',
      name: 'Promo 1',
      status: 'ACTIVE',
      type: 'BUY_X_GET_Y',
      rewardType: 'PERCENTAGE',
      value: 15,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
      priority: 100,
      qualifiers: [],
      rewards: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    })

    const response = await GET(new Request('http://localhost/api/promotions/promo_1'), {
      params: Promise.resolve({ id: 'promo_1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        promotion: {
          id: 'promo_1',
        },
      },
    })
  })

  it('patches and soft-disables promotion', async () => {
    mocks.updatePromotionFromAdmin.mockResolvedValue({
      ok: true,
      promotion: {
        id: 'promo_1',
        name: 'Updated',
        status: 'ACTIVE',
        type: 'BUY_X_GET_Y',
        rewardType: 'PERCENTAGE',
        value: 15,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 100,
        qualifiers: [],
        rewards: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      warnings: [],
    })
    mocks.disablePromotionForAdmin.mockResolvedValue({ id: 'promo_1', status: 'DISABLED' })

    const patchResponse = await PATCH(
      new Request('http://localhost/api/promotions/promo_1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'promo_1' }) }
    )
    const deleteResponse = await DELETE(new Request('http://localhost/api/promotions/promo_1'), {
      params: Promise.resolve({ id: 'promo_1' }),
    })

    expect(patchResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(200)
    expect(mocks.disablePromotionForAdmin).toHaveBeenCalledWith('promo_1')
  })

  it('allows no-op patch payloads', async () => {
    mocks.updatePromotionFromAdmin.mockResolvedValue({
      ok: true,
      promotion: {
        id: 'promo_1',
        name: 'Unchanged',
        status: 'ACTIVE',
        type: 'BUY_X_GET_Y',
        rewardType: 'PERCENTAGE',
        value: 15,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 100,
        qualifiers: [],
        rewards: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      warnings: [],
    })

    const response = await PATCH(
      new Request('http://localhost/api/promotions/promo_1', {
        method: 'PATCH',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'promo_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updatePromotionFromAdmin).toHaveBeenCalledWith('promo_1', {})
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        promotion: {
          id: 'promo_1',
          name: 'Unchanged',
        },
      },
    })
  })
})

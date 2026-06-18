import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prisma: {
    discount: {
      update: vi.fn(),
    },
  },
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import { DELETE, PATCH } from './route'

describe('/api/discounts/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'owner_1', role: 'OWNER' } })
  })

  it('updates discount using minimumOrderCents input', async () => {
    mocks.prisma.discount.update.mockResolvedValue({
      id: 'disc_1',
      code: 'WELCOME10',
      title: 'Updated title',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: 9900,
      usageLimit: 20,
      usageCount: 1,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
      combinesWithOrders: false,
      combinesWithProducts: false,
      combinesWithShipping: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    })

    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated title',
          minimumOrderCents: 9900,
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.discount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disc_1' },
        data: expect.objectContaining({
          title: 'Updated title',
          minimumOrderCents: 9900,
        }),
      })
    )
  })

  it('updates editable legacy discount fields including method, value, status, and combine flags', async () => {
    mocks.prisma.discount.update.mockResolvedValue({
      id: 'disc_1',
      code: 'SAVE15',
      title: 'Save 15',
      type: 'CODE',
      method: 'FIXED_AMOUNT',
      value: 1500,
      minimumOrderCents: 5000,
      usageLimit: 20,
      usageCount: 1,
      status: 'SCHEDULED',
      startsAt: new Date('2026-06-10T00:00:00.000Z'),
      endsAt: null,
      combinesWithOrders: true,
      combinesWithProducts: false,
      combinesWithShipping: true,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    })

    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          code: 'save15',
          type: 'CODE',
          method: 'FIXED_AMOUNT',
          value: 1500,
          minimumOrderCents: 5000,
          usageLimit: 20,
          status: 'SCHEDULED',
          startsAt: '2026-06-10T00:00:00.000Z',
          combinesWithOrders: true,
          combinesWithProducts: false,
          combinesWithShipping: true,
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.discount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'SAVE15',
          type: 'CODE',
          method: 'FIXED_AMOUNT',
          value: 1500,
          status: 'SCHEDULED',
          combinesWithOrders: true,
          combinesWithProducts: false,
          combinesWithShipping: true,
        }),
      })
    )
  })

  it('updates discount using legacy minimumOrder dollars input', async () => {
    mocks.prisma.discount.update.mockResolvedValue({
      id: 'disc_1',
      code: 'WELCOME10',
      title: 'Updated title',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: 1250,
      usageLimit: null,
      usageCount: 1,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
      combinesWithOrders: false,
      combinesWithProducts: false,
      combinesWithShipping: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    })

    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          minimumOrder: 12.5,
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(200)
    const callArgs = mocks.prisma.discount.update.mock.calls[0][0]
    expect(callArgs.data.minimumOrderCents).toBe(1250)
    expect(callArgs.data).not.toHaveProperty('minimumOrder')
  })

  it('rejects startsAt after endsAt on patch', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          startsAt: '2026-06-10T00:00:00.000Z',
          endsAt: '2026-06-09T00:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.prisma.discount.update).not.toHaveBeenCalled()
  })

  it('rejects BUY_X_GET_Y on patch for legacy discount editing', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          method: 'BUY_X_GET_Y',
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(400)
    expect(mocks.prisma.discount.update).not.toHaveBeenCalled()
  })

  it('returns a duplicate-code error on patch when Prisma reports a uniqueness violation', async () => {
    mocks.prisma.discount.update.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const response = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({
          code: 'WELCOME10',
        }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: false,
      error: 'A discount with this code already exists',
    })
  })

  it('rejects unauthorized patch and delete requests', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const patchResponse = await PATCH(
      new Request('http://localhost/api/discounts/disc_1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nope' }),
      }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )
    const deleteResponse = await DELETE(
      new Request('http://localhost/api/discounts/disc_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'disc_1' }) }
    )

    expect(patchResponse.status).toBe(401)
    expect(deleteResponse.status).toBe(401)
    expect(mocks.prisma.discount.update).not.toHaveBeenCalled()
  })
})

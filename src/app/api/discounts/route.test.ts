import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prisma: {
    discount: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

import { GET, POST } from './route'

describe('/api/discounts route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'owner_1', role: 'OWNER' } })
  })

  it('returns 401 when auth fails for GET', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/discounts?page=1&pageSize=20'))

    expect(response.status).toBe(401)
    expect(mocks.prisma.discount.findMany).not.toHaveBeenCalled()
  })

  it('returns paginated discount rows using explicit select fields', async () => {
    mocks.prisma.discount.findMany.mockResolvedValue([
      {
        id: 'disc_1',
        code: 'WELCOME10',
        title: 'Welcome 10',
        type: 'CODE',
        method: 'PERCENTAGE',
        value: 10,
        minimumOrderCents: 5000,
        usageLimit: 100,
        usageCount: 1,
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
        combinesWithOrders: true,
        combinesWithProducts: false,
        combinesWithShipping: false,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ])
    mocks.prisma.discount.count.mockResolvedValue(1)

    const response = await GET(new Request('http://localhost/api/discounts?page=1&pageSize=20'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.discount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        select: expect.objectContaining({
          id: true,
          code: true,
          title: true,
          method: true,
          value: true,
          minimumOrderCents: true,
          status: true,
        }),
      })
    )
    expect(json.success).toBe(true)
    expect(json.data.discounts[0].minimumOrder).toBe(50)
    expect(json.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
  })

  it('enforces max pageSize for discounts list', async () => {
    mocks.prisma.discount.findMany.mockResolvedValue([])
    mocks.prisma.discount.count.mockResolvedValue(0)

    await GET(new Request('http://localhost/api/discounts?page=1&pageSize=999'))

    expect(mocks.prisma.discount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      })
    )
  })

  it('creates a discount using minimumOrderCents as canonical input', async () => {
    mocks.prisma.discount.create.mockResolvedValue({
      id: 'disc_new',
      code: 'WELCOME10',
      title: 'Welcome 10',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: 7500,
      usageLimit: 100,
      usageCount: 0,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
      combinesWithOrders: false,
      combinesWithProducts: false,
      combinesWithShipping: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const response = await POST(
      new Request('http://localhost/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: 'welcome10',
          title: 'Welcome 10',
          type: 'CODE',
          method: 'PERCENTAGE',
          value: 10,
          minimumOrderCents: 7500,
          usageLimit: 100,
          status: 'ACTIVE',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.prisma.discount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'WELCOME10',
          minimumOrderCents: 7500,
        }),
      })
    )

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.minimumOrderCents).toBe(7500)
    expect(payload.data.minimumOrder).toBe(75)
  })

  it('creates a discount using legacy minimumOrder dollars input', async () => {
    mocks.prisma.discount.create.mockResolvedValue({
      id: 'disc_legacy',
      code: 'SPRING15',
      title: 'Spring 15',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 15,
      minimumOrderCents: 3250,
      usageLimit: null,
      usageCount: 0,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
      combinesWithOrders: false,
      combinesWithProducts: false,
      combinesWithShipping: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })

    const response = await POST(
      new Request('http://localhost/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: 'spring15',
          title: 'Spring 15',
          type: 'CODE',
          method: 'PERCENTAGE',
          value: 15,
          minimumOrder: 32.5,
          status: 'ACTIVE',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.prisma.discount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minimumOrderCents: 3250,
        }),
      })
    )

    const createArgs = mocks.prisma.discount.create.mock.calls[0][0]
    expect(createArgs.data).not.toHaveProperty('minimumOrder')
  })

  it('rejects unsupported BUY_X_GET_Y discount method creation', async () => {
    const response = await POST(
      new Request('http://localhost/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: 'BXY',
          title: 'Buy X Get Y',
          type: 'CODE',
          method: 'BUY_X_GET_Y',
          value: 100,
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.prisma.discount.create).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated mutations before touching Prisma', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await POST(
      new Request('http://localhost/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: 'WELCOME10',
          title: 'Welcome 10',
          type: 'CODE',
          method: 'PERCENTAGE',
          value: 10,
        }),
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.prisma.discount.create).not.toHaveBeenCalled()
  })
})


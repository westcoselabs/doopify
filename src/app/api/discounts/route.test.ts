import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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

import { GET } from './route'

describe('GET /api/discounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})


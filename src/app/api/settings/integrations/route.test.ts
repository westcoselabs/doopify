import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  prisma: {
    integration: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/utils/crypto', () => ({
  encrypt: vi.fn((value: string) => `enc:${value}`),
}))

import { GET } from './route'

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true })
  })

  it('applies default pagination and returns summary rows', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_1',
        name: 'Warehouse Sync',
        type: 'CUSTOM',
        webhookUrl: 'https://example.com/webhooks/doopify',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        _count: {
          events: 4,
          secrets: 2,
        },
      },
    ])
    mocks.prisma.integration.count.mockResolvedValue(1)

    const response = await GET(new Request('http://localhost/api/settings/integrations'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
      })
    )
    expect(json).toEqual({
      success: true,
      data: {
        integrations: [
          {
            id: 'int_1',
            name: 'Warehouse Sync',
            type: 'CUSTOM',
            webhookUrl: 'https://example.com/webhooks/doopify',
            status: 'ACTIVE',
            createdAt: new Date('2026-05-01T00:00:00.000Z').toISOString(),
            updatedAt: new Date('2026-05-01T00:00:00.000Z').toISOString(),
            eventCount: 4,
            secretCount: 2,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        },
      },
    })
  })

  it('enforces max pageSize for integration list', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([])
    mocks.prisma.integration.count.mockResolvedValue(0)

    await GET(new Request('http://localhost/api/settings/integrations?page=2&pageSize=999'))

    expect(mocks.prisma.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 100,
      })
    )
  })
})


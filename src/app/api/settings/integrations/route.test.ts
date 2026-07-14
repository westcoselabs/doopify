import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  prisma: {
    integration: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/utils/crypto', () => ({
  encrypt: vi.fn((value: string) => `enc:${value}`),
}))

import { GET, POST } from './route'

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwner.mockResolvedValue({ ok: true })
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

  it.each([
    ['unauthenticated', 401],
    ['admin', 403],
    ['staff', 403],
  ])('rejects %s integration reads', async (_role, status) => {
    mocks.requireOwner.mockResolvedValue({ ok: false, response: new Response('denied', { status }) })
    expect((await GET(new Request('http://localhost/api/settings/integrations'))).status).toBe(status)
  })

  it('allows an owner to create a custom integration without returning encrypted secret fields', async () => {
    mocks.prisma.integration.create.mockResolvedValue({
      id: 'int_1', name: 'Warehouse Sync', type: 'CUSTOM', webhookUrl: null, status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(), events: [], secrets: [{ id: 'secret_1', key: 'HEADER_X-Test' }],
    })
    const response = await POST(new Request('http://localhost/api/settings/integrations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Warehouse Sync', type: 'CUSTOM', webhookSecret: 'not-returned', secrets: [{ key: 'HEADER_X-Test', value: 'not-returned' }] }),
    }))
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).not.toContain('not-returned')
    expect(mocks.prisma.integration.create).toHaveBeenCalledWith(expect.objectContaining({ select: expect.any(Object) }))
  })

  it('blocks generic creation of built-in provider records', async () => {
    const response = await POST(new Request('http://localhost/api/settings/integrations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Stripe', type: 'PAYMENT_STRIPE', webhookSecret: 'not-returned' }),
    }))
    expect(response.status).toBe(403)
    expect(mocks.prisma.integration.create).not.toHaveBeenCalled()
  })
})


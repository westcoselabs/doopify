import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  prisma: {
    integration: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/server/auth/require-auth', () => ({ requireOwner: mocks.requireOwner }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/utils/crypto', () => ({ encrypt: vi.fn((value: string) => `enc:${value}`) }))

import { DELETE, GET, PUT } from './route'

const context = { params: Promise.resolve({ id: 'integration_1' }) }

describe('settings integration detail route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwner.mockResolvedValue({ ok: true, user: { role: 'OWNER' } })
  })

  it.each([
    ['GET', GET],
    ['PUT', PUT],
    ['DELETE', DELETE],
  ])('returns 401 to unauthenticated %s requests', async (_name, handler) => {
    mocks.requireOwner.mockResolvedValue({ ok: false, response: new Response('Unauthorized', { status: 401 }) })
    const response = await handler(new Request('http://localhost/api/settings/integrations/integration_1', { method: _name, body: _name === 'PUT' ? '{}' : undefined }), context)
    expect(response.status).toBe(401)
  })

  it.each([
    ['admin', 403],
    ['staff', 403],
  ])('returns %i for %s', async (_role, status) => {
    mocks.requireOwner.mockResolvedValue({ ok: false, response: new Response('Forbidden', { status }) })
    const response = await DELETE(new Request('http://localhost/api/settings/integrations/integration_1', { method: 'DELETE' }), context)
    expect(response.status).toBe(status)
  })

  it('redacts webhook ciphertext from GET payloads', async () => {
    mocks.prisma.integration.findUnique.mockResolvedValue({
      id: 'integration_1', name: 'Custom', type: 'CUSTOM', webhookUrl: null, status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(), events: [], secrets: [], webhookSecret: 'enc:do-not-return',
    })
    const response = await GET(new Request('http://localhost/api/settings/integrations/integration_1'), context)
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('do-not-return')
    expect(mocks.prisma.integration.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.any(Object) }))
  })

  it.each([
    ['PUT', PUT],
    ['DELETE', DELETE],
  ])('blocks generic %s operations on built-in providers', async (_name, handler) => {
    mocks.prisma.integration.findUnique.mockResolvedValue({ type: 'PAYMENT_STRIPE' })
    const response = await handler(new Request('http://localhost/api/settings/integrations/integration_1', { method: _name, body: _name === 'PUT' ? '{}' : undefined }), context)
    expect(response.status).toBe(403)
  })
})

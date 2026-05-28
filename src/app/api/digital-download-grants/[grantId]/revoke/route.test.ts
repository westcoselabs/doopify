import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revokeDigitalDownloadGrant: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/digital-delivery-admin.service', async () => {
  const actual = await vi.importActual<typeof import('@/server/services/digital-delivery-admin.service')>(
    '@/server/services/digital-delivery-admin.service'
  )

  return {
    ...actual,
    revokeDigitalDownloadGrant: mocks.revokeDigitalDownloadGrant,
  }
})

import { POST } from './route'

describe('POST /api/digital-download-grants/[grantId]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const response = await POST(new Request('http://localhost/api/digital-download-grants/grant_1/revoke', {
      method: 'POST',
    }), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(401)
  })

  it('revokes grant access for admin users', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN' } })
    mocks.revokeDigitalDownloadGrant.mockResolvedValue({
      grantId: 'grant_1',
      revokedAt: new Date('2026-05-28T10:00:00.000Z'),
      alreadyRevoked: false,
    })

    const response = await POST(new Request('http://localhost/api/digital-download-grants/grant_1/revoke', {
      method: 'POST',
    }), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        grantId: 'grant_1',
        revokedAt: '2026-05-28T10:00:00.000Z',
        alreadyRevoked: false,
      },
    })
  })
})

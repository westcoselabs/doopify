import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDigitalDownloadLink: vi.fn(),
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
    getAdminDigitalDownloadLink: mocks.getAdminDigitalDownloadLink,
  }
})

import { GET } from './route'

describe('GET /api/digital-download-grants/[grantId]/link', () => {
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

    const response = await GET(new Request('http://localhost/api/digital-download-grants/grant_1/link'), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns only safe download URL path', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.getAdminDigitalDownloadLink.mockResolvedValue({
      grantId: 'grant_1',
      downloadUrl: '/api/digital-downloads/raw-token-value',
    })

    const response = await GET(new Request('http://localhost/api/digital-download-grants/grant_1/link'), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({
      success: true,
      data: {
        grantId: 'grant_1',
        downloadUrl: '/api/digital-downloads/raw-token-value',
      },
    })
    expect(JSON.stringify(payload)).not.toContain('tokenHash')
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })
})

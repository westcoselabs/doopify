import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  regenerateDigitalDownloadGrant: vi.fn(),
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
    regenerateDigitalDownloadGrant: mocks.regenerateDigitalDownloadGrant,
  }
})

import { POST } from './route'

describe('POST /api/digital-download-grants/[grantId]/regenerate', () => {
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

    const response = await POST(new Request('http://localhost/api/digital-download-grants/grant_1/regenerate', {
      method: 'POST',
    }), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(401)
  })

  it('regenerates links without exposing internal token/hash/storage fields', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'OWNER' } })
    mocks.regenerateDigitalDownloadGrant.mockResolvedValue({
      grantId: 'grant_1',
      downloadUrl: '/api/digital-downloads/new-token-value',
      preservedDownloadCount: true,
      downloadCount: 3,
      downloadLimit: 5,
      status: 'ACTIVE',
    })

    const response = await POST(new Request('http://localhost/api/digital-download-grants/grant_1/regenerate', {
      method: 'POST',
    }), {
      params: Promise.resolve({ grantId: 'grant_1' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({
      success: true,
      data: {
        grantId: 'grant_1',
        downloadUrl: '/api/digital-downloads/new-token-value',
        preservedDownloadCount: true,
        downloadCount: 3,
        downloadLimit: 5,
        status: 'ACTIVE',
      },
    })
    expect(JSON.stringify(payload)).not.toContain('tokenHash')
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getEmailSettingsStatusSnapshot: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/email/email-settings-status.service', () => ({
  getEmailSettingsStatusSnapshot: mocks.getEmailSettingsStatusSnapshot,
}))

import { GET } from './route'

describe('GET /api/settings/email/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns auth response unchanged when unauthorized', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/settings/email/status'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ success: false, error: 'Unauthorized' })
    expect(mocks.getEmailSettingsStatusSnapshot).not.toHaveBeenCalled()
  })

  it('returns configured sender + provider status snapshot', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'admin_1', role: 'ADMIN', email: 'admin@example.com' },
    })
    mocks.getEmailSettingsStatusSnapshot.mockResolvedValue({
      senderConfigured: true,
      providerConfigured: true,
      provider: 'RESEND',
      providerSource: 'db',
      lastVerifiedAt: '2026-05-21T00:00:00.000Z',
      lastError: null,
      verificationStatus: 'verified',
      jobHealthStatus: 'healthy',
    })

    const response = await GET(new Request('http://localhost/api/settings/email/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        senderConfigured: true,
        providerConfigured: true,
        provider: 'RESEND',
        verificationStatus: 'verified',
        jobHealthStatus: 'healthy',
      })
    )
  })

  it('returns setup-needed state when sender/provider are missing', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'admin_1', role: 'ADMIN', email: 'admin@example.com' },
    })
    mocks.getEmailSettingsStatusSnapshot.mockResolvedValue({
      senderConfigured: false,
      providerConfigured: false,
      provider: 'NONE',
      providerSource: 'none',
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'needs_setup',
      jobHealthStatus: 'unknown',
    })

    const response = await GET(new Request('http://localhost/api/settings/email/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.verificationStatus).toBe('needs_setup')
    expect(payload.data.senderConfigured).toBe(false)
    expect(payload.data.providerConfigured).toBe(false)
  })

  it('returns warning-friendly status when verification is unavailable and job health is warning', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'admin_1', role: 'ADMIN', email: 'admin@example.com' },
    })
    mocks.getEmailSettingsStatusSnapshot.mockResolvedValue({
      senderConfigured: true,
      providerConfigured: true,
      provider: 'SMTP',
      providerSource: 'env',
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'verification_unavailable',
      jobHealthStatus: 'warning',
    })

    const response = await GET(new Request('http://localhost/api/settings/email/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        senderConfigured: true,
        providerConfigured: true,
        verificationStatus: 'verification_unavailable',
        jobHealthStatus: 'warning',
      })
    )
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  verifyProviderConnection: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/provider-connection.service', () => ({
  verifyProviderConnection: mocks.verifyProviderConnection,
}))

import { POST } from './route'

describe('settings shipping test-provider route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST' }),
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.verifyProviderConnection).not.toHaveBeenCalled()
  })

  it('returns provider test result without secret values', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.verifyProviderConnection.mockResolvedValue({
      status: {
        provider: 'EASYPOST',
        integrationType: 'SHIPPING_EASYPOST',
        integrationId: 'int_1',
        integrationStatus: 'ACTIVE',
        hasCredentials: true,
        connected: true,
        updatedAt: '2026-04-29T18:32:00.000Z',
      },
      verification: {
        ok: true,
        message: 'EasyPost connection successful.',
        metadata: { accountId: 'user_123' },
      },
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST' }),
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload).toMatchObject({
      success: true,
      data: {
        provider: 'EASYPOST',
        result: {
          ok: true,
        },
      },
    })
    expect(JSON.stringify(payload)).not.toContain('apiKey')
  })

  it('returns a controlled verification failure payload when provider setup is incomplete', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.verifyProviderConnection.mockRejectedValue(
      new Error('Provider is not configured. Save credentials first.')
    )

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'SHIPPO' }),
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        provider: 'SHIPPO',
        status: null,
        result: {
          ok: false,
          message: 'Provider is not configured. Save credentials first.',
        },
      },
    })
  })

  it('returns 500 for unexpected server errors', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.verifyProviderConnection.mockRejectedValue(new Error('database unavailable'))

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST' }),
      })
    )

    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('database unavailable')
  })
})

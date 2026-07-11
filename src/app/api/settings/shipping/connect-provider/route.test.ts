import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  connectShippingProvider: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/server/shipping/shipping-provider.service', () => ({
  connectShippingProvider: mocks.connectShippingProvider,
}))

import { POST } from './route'

describe('settings shipping connect-provider route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST requires owner auth', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/connect-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST', apiKey: 'ep_test_123' }),
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.connectShippingProvider).not.toHaveBeenCalled()
  })

  it('rejects an authenticated non-owner', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/connect-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST', apiKey: 'candidate' }),
      })
    )

    expect(response.status).toBe(403)
    expect(mocks.connectShippingProvider).not.toHaveBeenCalled()
  })

  it('returns provider status without credentials', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.connectShippingProvider.mockResolvedValue({
      provider: 'EASYPOST',
      integrationType: 'SHIPPING_EASYPOST',
      integrationId: 'int_1',
      integrationStatus: 'ACTIVE',
      hasCredentials: true,
      connected: true,
      updatedAt: '2026-04-29T18:30:00.000Z',
    })

    const response = await POST(
      new Request('http://localhost/api/settings/shipping/connect-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'EASYPOST', apiKey: 'ep_test_123' }),
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload).toMatchObject({
      success: true,
      data: {
        provider: 'EASYPOST',
        status: {
          integrationType: 'SHIPPING_EASYPOST',
          connected: true,
          hasCredentials: true,
        },
      },
    })
    expect(JSON.stringify(payload)).not.toContain('ep_test_123')
  })
})

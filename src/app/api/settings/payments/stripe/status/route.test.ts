import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  getStripeSavedStatusSnapshot: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeSavedStatusSnapshot: mocks.getStripeSavedStatusSnapshot,
}))

import { GET } from './route'

describe('GET /api/settings/payments/stripe/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_STORE_URL = 'https://store.example.com'
  })

  it('requires owner auth', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(403)
    expect(mocks.getStripeSavedStatusSnapshot).not.toHaveBeenCalled()
  })

  it('returns configured when Stripe is saved but never verified', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: true,
      checkoutKeysConfigured: true,
      source: 'db',
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      publishableKeyMasked: 'pk_test_******1234',
      secretKeyMasked: 'sk_test_******5678',
      webhookSecretMasked: 'whsec_******9012',
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'configured',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.verificationStatus).toBe('configured')
    expect(payload.data.webhookEndpointReady).toBe(true)
  })

  it('returns verified when Stripe has verification metadata', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: true,
      checkoutKeysConfigured: true,
      source: 'db',
      mode: 'live',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      publishableKeyMasked: 'pk_live_******1234',
      secretKeyMasked: 'sk_live_******5678',
      webhookSecretMasked: 'whsec_******9012',
      lastVerifiedAt: '2026-05-10T10:00:00.000Z',
      lastError: null,
      verificationStatus: 'verified',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.verificationStatus).toBe('verified')
    expect(payload.data.lastVerifiedAt).toBe('2026-05-10T10:00:00.000Z')
  })

  it('returns needs_attention when Stripe verification failed', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: true,
      checkoutKeysConfigured: true,
      source: 'db',
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      publishableKeyMasked: 'pk_test_******1234',
      secretKeyMasked: 'sk_test_******5678',
      webhookSecretMasked: 'whsec_******9012',
      lastVerifiedAt: null,
      lastError: 'invalid api key',
      verificationStatus: 'needs_attention',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.verificationStatus).toBe('needs_attention')
    expect(payload.data.lastError).toBe('invalid api key')
  })

  it('returns needs_setup when secret key is missing', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: false,
      checkoutKeysConfigured: false,
      source: 'db',
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: false,
      hasWebhookSecret: true,
      publishableKeyMasked: 'pk_test_******1234',
      secretKeyMasked: null,
      webhookSecretMasked: 'whsec_******9012',
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'needs_setup',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.verificationStatus).toBe('needs_setup')
    expect(payload.data.hasSecretKey).toBe(false)
  })

  it('returns needs_setup when webhook secret is missing', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: false,
      checkoutKeysConfigured: true,
      source: 'db',
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: false,
      publishableKeyMasked: 'pk_test_******1234',
      secretKeyMasked: 'sk_test_******5678',
      webhookSecretMasked: null,
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'needs_setup',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/status'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data.verificationStatus).toBe('needs_setup')
    expect(payload.data.configured).toBe(false)
    expect(payload.data.checkoutKeysConfigured).toBe(true)
    expect(payload.data.hasWebhookSecret).toBe(false)
  })
})

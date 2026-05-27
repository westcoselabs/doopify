import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  getStripeRuntimeStatusBundle: vi.fn(),
  getStripeWebhookSecretSelection: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeRuntimeStatusBundle: mocks.getStripeRuntimeStatusBundle,
  getStripeWebhookSecretSelection: mocks.getStripeWebhookSecretSelection,
}))

import { GET } from './route'

describe('GET /api/settings/payments/stripe/runtime-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires owner auth', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/runtime-status'))
    expect(response.status).toBe(403)
    expect(mocks.getStripeRuntimeStatusBundle).not.toHaveBeenCalled()
  })

  it('returns safe runtime status without secret values', async () => {
    process.env.NEXT_PUBLIC_STORE_URL = 'https://store.example.com'
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeRuntimeStatusBundle.mockResolvedValue({
      runtime: {
        source: 'db',
        verified: true,
        mode: 'live',
        publishableKey: 'pk_live_visible',
        secretKey: 'sk_live_hidden',
        webhookSecret: 'whsec_hidden',
        accountId: 'acct_live_123',
        chargesEnabled: true,
        payoutsEnabled: true,
      },
      providerStatusUnavailable: false,
      providerStatus: {
      configured: true,
      verified: true,
      mode: 'live',
      publishableKeyMasked: 'pk_live_••••••1234',
      secretKeyMasked: 'sk_live_••••••5678',
      webhookSecretMasked: 'whsec_••••••9012',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: 'acct_live_123',
      chargesEnabled: true,
      payoutsEnabled: true,
      lastVerifiedAt: '2026-05-07T10:00:00.000Z',
      lastError: null,
      source: 'db',
      runtimeSource: 'db',
      },
    })
    mocks.getStripeWebhookSecretSelection.mockResolvedValue({
      source: 'db',
      webhookSecret: 'whsec_hidden',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/runtime-status'))
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload).toMatchObject({
      success: true,
      data: {
        source: 'db',
        mode: 'live',
        hasPublishableKey: true,
        hasSecretKey: true,
        hasWebhookSecret: true,
        webhookSource: 'db',
        verified: true,
        accountId: 'acct_live_123',
        chargesEnabled: true,
        payoutsEnabled: true,
        webhookEndpoint: 'https://store.example.com/api/webhooks/stripe',
        webhookEndpointSource: 'env',
        webhookEndpointReady: true,
        webhookEndpointIssue: null,
        providerStatus: {
          configured: true,
          verified: true,
        },
        providerStatusUnavailable: false,
      },
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('sk_live_hidden')
    expect(serialized).not.toContain('whsec_hidden')
  })

  it('reports webhook endpoint setup needed when NEXT_PUBLIC_STORE_URL is placeholder', async () => {
    process.env.NEXT_PUBLIC_STORE_URL = 'https://your-doopify-beta-domain.vercel.app'
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeRuntimeStatusBundle.mockResolvedValue({
      runtime: {
        source: 'db',
        verified: true,
        mode: 'test',
        publishableKey: 'pk_test_visible',
        secretKey: 'sk_test_hidden',
        webhookSecret: 'whsec_hidden',
        accountId: 'acct_test_123',
        chargesEnabled: true,
        payoutsEnabled: true,
      },
      providerStatusUnavailable: false,
      providerStatus: {
      configured: true,
      verified: true,
      mode: 'test',
      publishableKeyMasked: 'pk_test_••••••1234',
      secretKeyMasked: 'sk_test_••••••5678',
      webhookSecretMasked: 'whsec_••••••9012',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: 'acct_test_123',
      chargesEnabled: true,
      payoutsEnabled: true,
      lastVerifiedAt: '2026-05-07T10:00:00.000Z',
      lastError: null,
      source: 'db',
      runtimeSource: 'db',
      },
    })
    mocks.getStripeWebhookSecretSelection.mockResolvedValue({
      source: 'db',
      webhookSecret: 'whsec_hidden',
    })

    const response = await GET(new Request('https://admin.example.com/api/settings/payments/stripe/runtime-status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.webhookEndpointReady).toBe(false)
    expect(payload.data.webhookEndpointIssue).toBe('placeholder')
    expect(payload.data.webhookEndpoint).toBe('https://admin.example.com/api/webhooks/stripe')
  })

  it('returns non-blocking warning flag when provider snapshot is unavailable', async () => {
    process.env.NEXT_PUBLIC_STORE_URL = 'https://store.example.com'
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })
    mocks.getStripeRuntimeStatusBundle.mockResolvedValue({
      runtime: {
        source: 'db',
        verified: true,
        mode: 'live',
        publishableKey: 'pk_live_visible',
        secretKey: 'sk_live_hidden',
        webhookSecret: 'whsec_hidden',
        accountId: null,
        chargesEnabled: null,
        payoutsEnabled: null,
      },
      providerStatusUnavailable: true,
      providerStatus: {
        configured: true,
        verified: true,
        mode: 'live',
        publishableKeyMasked: null,
        secretKeyMasked: null,
        webhookSecretMasked: null,
        hasPublishableKey: true,
        hasSecretKey: true,
        hasWebhookSecret: true,
        webhookConfigured: true,
        accountId: null,
        chargesEnabled: null,
        payoutsEnabled: null,
        lastVerifiedAt: null,
        lastError: 'Stripe provider snapshot timed out or failed.',
        source: 'db',
        runtimeSource: 'db',
      },
    })
    mocks.getStripeWebhookSecretSelection.mockResolvedValue({
      source: 'db',
      webhookSecret: 'whsec_hidden',
    })

    const response = await GET(new Request('http://localhost/api/settings/payments/stripe/runtime-status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.providerStatusUnavailable).toBe(true)
    expect(payload.data.verified).toBe(true)
  })
})

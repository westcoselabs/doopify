import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'test_jwt_secret_for_tests_only_123456',
    NODE_ENV: 'test',
    STRIPE_SECRET_KEY: 'sk_test_env_runtime' as string | undefined,
    STRIPE_WEBHOOK_SECRET: 'whsec_env_runtime' as string | undefined,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_env_runtime' as string | undefined,
    RESEND_API_KEY: undefined,
    RESEND_WEBHOOK_SECRET: undefined,
    SMTP_HOST: undefined,
    SMTP_PORT: undefined,
    SMTP_SECURE: undefined,
    SMTP_USERNAME: undefined,
    SMTP_PASSWORD: undefined,
    SMTP_FROM_EMAIL: undefined,
    SHIPPO_API_KEY: undefined,
    EASYPOST_API_KEY: undefined,
    EASYPOST_WEBHOOK_SECRET: undefined,
    SHIPPO_WEBHOOK_SECRET: undefined,
    NEXT_PUBLIC_STORE_URL: undefined,
    WEBHOOK_RETRY_SECRET: undefined,
    JOB_RUNNER_SECRET: undefined,
    ABANDONED_CHECKOUT_SECRET: undefined,
  },
  getRuntimeProviderConnection: vi.fn(),
  getStripeProviderStatusSnapshot: vi.fn(),
}))

const MASK_TOKEN = '••••••'

function fakeMaskCredential(_provider: string, key: string, value: string | null) {
  if (!value) return null
  if (key === 'MODE') return value
  const suffix = value.length >= 4 ? value.slice(-4) : value
  if (key === 'PUBLISHABLE_KEY') {
    if (value.startsWith('pk_test_')) return `pk_test_${MASK_TOKEN}${suffix}`
    if (value.startsWith('pk_live_')) return `pk_live_${MASK_TOKEN}${suffix}`
    return `pk_${MASK_TOKEN}${suffix}`
  }
  if (key === 'SECRET_KEY') {
    if (value.startsWith('sk_test_')) return `sk_test_${MASK_TOKEN}${suffix}`
    if (value.startsWith('sk_live_')) return `sk_live_${MASK_TOKEN}${suffix}`
    return `sk_${MASK_TOKEN}${suffix}`
  }
  if (key === 'WEBHOOK_SECRET' && value.startsWith('whsec_')) {
    return `whsec_${MASK_TOKEN}${suffix}`
  }
  return `${value.slice(0, 4)}${MASK_TOKEN}${suffix}`
}

vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/server/services/provider-connection.service', () => ({
  getRuntimeProviderConnection: mocks.getRuntimeProviderConnection,
  getStripeProviderStatusSnapshot: mocks.getStripeProviderStatusSnapshot,
  maskCredential: fakeMaskCredential,
}))

import {
  getStripeSavedStatusSnapshot,
  getStripeRuntimeConnection,
  getStripeRuntimeStatusBundle,
  getStripeWebhookSecretSelection,
} from './stripe-runtime.service'

describe('stripe runtime service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_env_runtime'
  })

  it('prefers verified DB credentials over env fallback credentials', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      accountId: 'acct_live_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    })

    const runtime = await getStripeRuntimeConnection()

    expect(runtime).toEqual({
      source: 'db',
      verified: true,
      mode: 'live',
      publishableKey: 'pk_live_db_runtime',
      secretKey: 'sk_live_db_runtime',
      webhookSecret: 'whsec_live_db_runtime',
      accountId: 'acct_live_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    })
  })

  it('uses env fallback when DB Stripe connection is not verified', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'env',
      provider: 'STRIPE',
      verified: false,
      credentials: {
        SECRET_KEY: 'sk_test_env_runtime',
        PUBLISHABLE_KEY: 'pk_test_env_runtime',
        WEBHOOK_SECRET: 'whsec_env_runtime',
        MODE: 'test',
      },
    })

    const runtime = await getStripeRuntimeConnection()

    expect(runtime).toMatchObject({
      source: 'env',
      verified: false,
      mode: 'test',
      publishableKey: 'pk_test_env_runtime',
      secretKey: 'sk_test_env_runtime',
      webhookSecret: 'whsec_env_runtime',
    })
    expect(mocks.getStripeProviderStatusSnapshot).not.toHaveBeenCalled()
  })

  it('returns source none when no DB or env Stripe connection exists', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })

    const runtime = await getStripeRuntimeConnection()

    expect(runtime).toEqual({
      source: 'none',
      verified: false,
      mode: null,
      publishableKey: null,
      secretKey: null,
      webhookSecret: null,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })
  })

  it('prefers verified DB webhook secret for webhook verification', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })

    const selection = await getStripeWebhookSecretSelection()

    expect(selection).toEqual({
      source: 'db',
      webhookSecret: 'whsec_live_db_runtime',
    })
  })

  it('falls back to env webhook secret when DB webhook secret is unavailable', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })

    const selection = await getStripeWebhookSecretSelection()

    expect(selection).toEqual({
      source: 'env',
      webhookSecret: 'whsec_env_runtime',
    })
  })

  it('returns none when webhook secret is unavailable in DB and env', async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = undefined
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })

    const selection = await getStripeWebhookSecretSelection()

    expect(selection).toEqual({
      source: 'none',
      webhookSecret: null,
    })
  })

  it('returns none when env webhook secret is placeholder', async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_replace_me'
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })

    const selection = await getStripeWebhookSecretSelection()

    expect(selection).toEqual({
      source: 'none',
      webhookSecret: null,
    })
  })

  it('returns fallback provider status when snapshot lookup fails', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockRejectedValue(new Error('snapshot failed'))

    const bundle = await getStripeRuntimeStatusBundle({ providerStatusTimeoutMs: 10 })

    expect(bundle.providerStatusUnavailable).toBe(true)
    expect(bundle.runtime.source).toBe('db')
    expect(bundle.runtime.verified).toBe(true)
    expect(bundle.providerStatus.verified).toBe(true)
    expect(bundle.providerStatus.lastError).toContain('timed out or failed')
  })

  it('bundle reports fully configured payload when snapshot succeeds', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
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
    })

    const bundle = await getStripeRuntimeStatusBundle()

    expect(bundle.providerStatusUnavailable).toBe(false)
    expect(bundle.providerStatus.verified).toBe(true)
    expect(bundle.providerStatus.hasPublishableKey).toBe(true)
    expect(bundle.providerStatus.hasSecretKey).toBe(true)
    expect(bundle.providerStatus.hasWebhookSecret).toBe(true)
    expect(bundle.providerStatus.publishableKeyMasked).toBe('pk_live_••••••1234')
    expect(bundle.providerStatus.secretKeyMasked).toBe('sk_live_••••••5678')
  })

  it('bundle reports NOT_CONFIGURED-shaped payload when no keys are saved (missing keys is real)', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })

    const bundle = await getStripeRuntimeStatusBundle()

    expect(bundle.providerStatusUnavailable).toBe(false)
    expect(bundle.providerStatus.verified).toBe(false)
    expect(bundle.providerStatus.configured).toBe(false)
    expect(bundle.providerStatus.hasPublishableKey).toBe(false)
    expect(bundle.providerStatus.hasSecretKey).toBe(false)
    expect(bundle.providerStatus.hasWebhookSecret).toBe(false)
    expect(bundle.providerStatus.publishableKeyMasked).toBeNull()
    expect(bundle.providerStatus.secretKeyMasked).toBeNull()
    expect(bundle.providerStatus.lastError).toBeNull()
  })

  it('bundle preserves configured-and-masked keys when verification snapshot times out', async () => {
    // Stripe is DB-saved + verified, but the snapshot lookup times out.
    // The bundle must NOT report missing keys; it should mask the runtime keys
    // and keep verified=true so the UI does not say "Configure payments".
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_real_secret_12345',
        PUBLISHABLE_KEY: 'pk_live_real_public_67890',
        WEBHOOK_SECRET: 'whsec_real_webhook_abcde',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockImplementation(
      () => new Promise(() => {
        /* never resolves -> trigger timeout */
      })
    )

    const bundle = await getStripeRuntimeStatusBundle({ providerStatusTimeoutMs: 10 })

    expect(bundle.providerStatusUnavailable).toBe(true)
    expect(bundle.providerStatus.verified).toBe(true)
    expect(bundle.providerStatus.configured).toBe(true)
    expect(bundle.providerStatus.hasPublishableKey).toBe(true)
    expect(bundle.providerStatus.hasSecretKey).toBe(true)
    expect(bundle.providerStatus.hasWebhookSecret).toBe(true)
    expect(bundle.providerStatus.publishableKeyMasked).toBe('pk_live_••••••7890')
    expect(bundle.providerStatus.secretKeyMasked).toBe('sk_live_••••••2345')
    expect(bundle.providerStatus.lastError).toContain('timed out or failed')

    // Raw secret values must never leak through the providerStatus payload
    // that the runtime-status route forwards to the UI.
    const serializedProviderStatus = JSON.stringify(bundle.providerStatus)
    expect(serializedProviderStatus).not.toContain('sk_live_real_secret_12345')
    expect(serializedProviderStatus).not.toContain('whsec_real_webhook_abcde')
    expect(serializedProviderStatus).not.toContain('pk_live_real_public_67890')
  })

  it('bundle marks webhook secret configured even when snapshot times out, so confidence is reported as unknown not missing', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_test_db_runtime',
        PUBLISHABLE_KEY: 'pk_test_db_runtime',
        WEBHOOK_SECRET: 'whsec_test_db_runtime',
        MODE: 'test',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockRejectedValue(new Error('snapshot failed'))

    const bundle = await getStripeRuntimeStatusBundle({ providerStatusTimeoutMs: 10 })

    expect(bundle.providerStatusUnavailable).toBe(true)
    expect(bundle.providerStatus.webhookConfigured).toBe(true)
    expect(bundle.providerStatus.hasWebhookSecret).toBe(true)
    expect(bundle.providerStatus.webhookSecretMasked).toBe('whsec_••••••time')
  })

  it('uses a single provider snapshot call for bundle and runtime reads', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
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
    })

    const bundle = await getStripeRuntimeStatusBundle()

    expect(bundle.providerStatus.accountId).toBe('acct_live_123')
    expect(mocks.getStripeProviderStatusSnapshot).toHaveBeenCalledTimes(1)
  })

  it('saved status reports configured when db keys are saved but never verified', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: true,
      verified: false,
      mode: 'test',
      publishableKeyMasked: 'pk_test_â€¢â€¢â€¢â€¢â€¢â€¢1234',
      secretKeyMasked: 'sk_test_â€¢â€¢â€¢â€¢â€¢â€¢5678',
      webhookSecretMasked: 'whsec_â€¢â€¢â€¢â€¢â€¢â€¢9012',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
      lastVerifiedAt: null,
      lastError: null,
      source: 'db',
      runtimeSource: 'none',
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('configured')
    expect(status.configured).toBe(true)
    expect(status.checkoutKeysConfigured).toBe(true)
  })

  it('saved status reports verified when verification metadata exists', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'db',
      provider: 'STRIPE',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
        MODE: 'live',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: true,
      verified: true,
      mode: 'live',
      publishableKeyMasked: 'pk_live_â€¢â€¢â€¢â€¢â€¢â€¢1234',
      secretKeyMasked: 'sk_live_â€¢â€¢â€¢â€¢â€¢â€¢5678',
      webhookSecretMasked: 'whsec_â€¢â€¢â€¢â€¢â€¢â€¢9012',
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
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('verified')
    expect(status.configured).toBe(true)
    expect(status.checkoutKeysConfigured).toBe(true)
  })

  it('saved status reports needs_attention when last verification failed', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: true,
      verified: false,
      mode: 'test',
      publishableKeyMasked: 'pk_test_â€¢â€¢â€¢â€¢â€¢â€¢1234',
      secretKeyMasked: 'sk_test_â€¢â€¢â€¢â€¢â€¢â€¢5678',
      webhookSecretMasked: 'whsec_â€¢â€¢â€¢â€¢â€¢â€¢9012',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
      lastVerifiedAt: null,
      lastError: 'invalid api key',
      source: 'db',
      runtimeSource: 'none',
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('needs_attention')
    expect(status.configured).toBe(true)
    expect(status.checkoutKeysConfigured).toBe(true)
  })

  it('saved status reports needs_setup when secret key is missing', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: false,
      verified: false,
      mode: 'test',
      publishableKeyMasked: 'pk_test_â€¢â€¢â€¢â€¢â€¢â€¢1234',
      secretKeyMasked: null,
      webhookSecretMasked: 'whsec_â€¢â€¢â€¢â€¢â€¢â€¢9012',
      hasPublishableKey: true,
      hasSecretKey: false,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
      lastVerifiedAt: null,
      lastError: null,
      source: 'db',
      runtimeSource: 'none',
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('needs_setup')
    expect(status.configured).toBe(false)
    expect(status.checkoutKeysConfigured).toBe(false)
  })

  it('saved status reports needs_setup when webhook secret is missing', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'STRIPE',
      verified: false,
      credentials: null,
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: true,
      verified: false,
      mode: 'test',
      publishableKeyMasked: 'pk_test_â€¢â€¢â€¢â€¢â€¢â€¢1234',
      secretKeyMasked: 'sk_test_â€¢â€¢â€¢â€¢â€¢â€¢5678',
      webhookSecretMasked: null,
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: false,
      webhookConfigured: false,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
      lastVerifiedAt: null,
      lastError: null,
      source: 'db',
      runtimeSource: 'none',
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('needs_setup')
    expect(status.configured).toBe(false)
    expect(status.checkoutKeysConfigured).toBe(true)
  })

  it('saved status reports verification_unavailable when env config exists without db verification state', async () => {
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'env',
      provider: 'STRIPE',
      verified: false,
      credentials: {
        SECRET_KEY: 'sk_test_env_runtime',
        PUBLISHABLE_KEY: 'pk_test_env_runtime',
        WEBHOOK_SECRET: 'whsec_env_runtime',
        MODE: 'test',
      },
    })
    mocks.getStripeProviderStatusSnapshot.mockResolvedValue({
      configured: false,
      verified: false,
      mode: 'test',
      publishableKeyMasked: null,
      secretKeyMasked: null,
      webhookSecretMasked: null,
      hasPublishableKey: false,
      hasSecretKey: false,
      hasWebhookSecret: false,
      webhookConfigured: false,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
      lastVerifiedAt: null,
      lastError: null,
      source: 'env',
      runtimeSource: 'env',
    })

    const status = await getStripeSavedStatusSnapshot()
    expect(status.verificationStatus).toBe('verification_unavailable')
    expect(status.configured).toBe(true)
    expect(status.checkoutKeysConfigured).toBe(true)
    expect(status.hasPublishableKey).toBe(true)
    expect(status.hasSecretKey).toBe(true)
    expect(status.hasWebhookSecret).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'test_jwt_secret_for_tests_only_123456',
    NODE_ENV: 'test',
    STRIPE_SECRET_KEY: undefined as string | undefined,
    STRIPE_WEBHOOK_SECRET: undefined as string | undefined,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined as string | undefined,
    RESEND_API_KEY: 're_env_key',
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
  prisma: {
    integration: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    integrationSecret: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  encrypt: vi.fn((value: string) => `enc:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
  connectShippingProvider: vi.fn(),
  disconnectShippingProvider: vi.fn(),
  getShippingProviderConnectionStatus: vi.fn(),
  testShippingProviderConnection: vi.fn(),
  testShippingProviderConnectionWithApiKey: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/utils/crypto', () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}))
vi.mock('@/server/shipping/shipping-provider.service', () => ({
  connectShippingProvider: mocks.connectShippingProvider,
  disconnectShippingProvider: mocks.disconnectShippingProvider,
  getShippingProviderConnectionStatus: mocks.getShippingProviderConnectionStatus,
  testShippingProviderConnection: mocks.testShippingProviderConnection,
  testShippingProviderConnectionWithApiKey: mocks.testShippingProviderConnectionWithApiKey,
}))

import {
  getProviderStatus,
  getRuntimeProviderConnection,
  sanitizeProviderError,
  getStripeProviderStatusSnapshot,
  saveProviderCredentials,
  verifyProviderConnection,
} from './provider-connection.service'

describe('provider connection service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback: any) => callback(mocks.prisma))
    mocks.prisma.integration.update.mockResolvedValue({ id: 'int_existing' })
    mocks.prisma.integration.create.mockResolvedValue({ id: 'int_created' })
    mocks.prisma.integration.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.integrationSecret.deleteMany.mockResolvedValue({ count: 0 })
    mocks.env.RESEND_API_KEY = 're_env_key'
    mocks.env.RESEND_WEBHOOK_SECRET = undefined
    mocks.env.STRIPE_SECRET_KEY = undefined
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = undefined
    mocks.env.STRIPE_WEBHOOK_SECRET = undefined
    vi.unstubAllGlobals()
  })

  it('prefers verified db credentials over env fallback', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_resend_1',
      type: 'EMAIL_RESEND',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-30T01:00:00.000Z'),
      updatedAt: new Date('2026-04-30T01:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'API_KEY', value: 'enc:re_db_key' },
        { id: 'sec_2', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-04-30T01:05:00.000Z' },
      ],
    }])

    const runtime = await getRuntimeProviderConnection('RESEND')

    expect(runtime).toMatchObject({
      source: 'db',
      verified: true,
      credentials: {
        API_KEY: 're_db_key',
      },
    })
  })

  it('falls back to env credentials when db connection is missing', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([])

    const runtime = await getRuntimeProviderConnection('RESEND')

    expect(runtime).toMatchObject({
      source: 'env',
      verified: false,
      credentials: {
        API_KEY: 're_env_key',
      },
    })
  })

  it('treats placeholder Resend env credentials as missing', async () => {
    mocks.env.RESEND_API_KEY = 're_replace_me'
    mocks.prisma.integration.findMany.mockResolvedValue([])

    const runtime = await getRuntimeProviderConnection('RESEND')

    expect(runtime).toMatchObject({
      source: 'none',
      verified: false,
      credentials: null,
    })
  })

  it('stores provider credentials through encrypted integration secret writes', async () => {
    const integrationRecord = {
      id: 'int_resend_2',
      type: 'EMAIL_RESEND',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-30T02:00:00.000Z'),
      updatedAt: new Date('2026-04-30T02:00:00.000Z'),
      secrets: [{ id: 'sec_saved', key: 'API_KEY', value: 'enc:re_saved_key' }],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([integrationRecord])

    mocks.prisma.integration.create.mockResolvedValue({ id: 'int_resend_2' })

    const status = await saveProviderCredentials('RESEND', { apiKey: 're_saved_key' })

    expect(mocks.encrypt).toHaveBeenCalledWith('re_saved_key')
    expect(mocks.prisma.integrationSecret.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'API_KEY',
          value: 'enc:re_saved_key',
        }),
        update: expect.objectContaining({
          value: 'enc:re_saved_key',
        }),
      })
    )
    expect(status.state).toBe('CREDENTIALS_SAVED')
  })

  it('prefers verified Stripe DB credentials over env fallback', async () => {
    mocks.env.STRIPE_SECRET_KEY = 'sk_test_env_runtime'
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_env_runtime'
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_env_runtime'
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_stripe_1',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-30T03:00:00.000Z'),
      updatedAt: new Date('2026-04-30T03:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'SECRET_KEY', value: 'enc:sk_live_db_runtime' },
        { id: 'sec_2', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_db_runtime' },
        { id: 'sec_3', key: 'MODE', value: 'enc:live' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_live_db_runtime' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-04-30T03:05:00.000Z' },
      ],
    }])

    const runtime = await getRuntimeProviderConnection('STRIPE')

    expect(runtime).toMatchObject({
      source: 'db',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_db_runtime',
        PUBLISHABLE_KEY: 'pk_live_db_runtime',
        MODE: 'live',
        WEBHOOK_SECRET: 'whsec_live_db_runtime',
      },
    })
  })

  it('ignores unverified Stripe DB credentials and falls back to env', async () => {
    mocks.env.STRIPE_SECRET_KEY = 'sk_test_env_runtime'
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_env_runtime'
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_env_runtime'
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_stripe_2',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-30T03:10:00.000Z'),
      updatedAt: new Date('2026-04-30T03:10:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'SECRET_KEY', value: 'enc:sk_live_db_unverified' },
        { id: 'sec_2', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_db_unverified' },
        { id: 'sec_3', key: 'MODE', value: 'enc:live' },
      ],
    }])

    const runtime = await getRuntimeProviderConnection('STRIPE')

    expect(runtime).toMatchObject({
      source: 'env',
      verified: false,
      credentials: {
        SECRET_KEY: 'sk_test_env_runtime',
        PUBLISHABLE_KEY: 'pk_test_env_runtime',
        WEBHOOK_SECRET: 'whsec_env_runtime',
        MODE: 'test',
      },
    })
  })

  it('treats placeholder Stripe env credentials as missing', async () => {
    mocks.env.STRIPE_SECRET_KEY = 'sk_test_replace_me'
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_replace_me'
    mocks.env.STRIPE_WEBHOOK_SECRET = 'whsec_replace_me'
    mocks.prisma.integration.findMany.mockResolvedValue([])

    const runtime = await getRuntimeProviderConnection('STRIPE')

    expect(runtime).toMatchObject({
      source: 'none',
      verified: false,
      credentials: null,
    })
  })

  it('encrypts Stripe SECRET_KEY and WEBHOOK_SECRET when saving credentials', async () => {
    const integrationRecord = {
      id: 'int_stripe_save',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-04-30T04:00:00.000Z'),
      updatedAt: new Date('2026-04-30T04:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'SECRET_KEY', value: 'enc:sk_live_new_secret' },
        { id: 'sec_2', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_new_key' },
        { id: 'sec_3', key: 'MODE', value: 'enc:live' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_live_new_secret' },
      ],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([integrationRecord])

    mocks.prisma.integration.create.mockResolvedValue({ id: 'int_stripe_save' })

    const status = await saveProviderCredentials('STRIPE', {
      publishableKey: 'pk_live_new_key',
      secretKey: 'sk_live_new_secret',
      webhookSecret: 'whsec_live_new_secret',
      mode: 'live',
    })

    expect(mocks.encrypt).toHaveBeenCalledWith('sk_live_new_secret')
    expect(mocks.encrypt).toHaveBeenCalledWith('whsec_live_new_secret')
    expect(mocks.encrypt).toHaveBeenCalledWith('pk_live_new_key')

    const allUpsertArgs = mocks.prisma.integrationSecret.upsert.mock.calls as Array<[{ create: { key: string; value: string }; update: { value: string } }]>
    const secretKeyUpsert = allUpsertArgs.find((args) => args[0].create.key === 'SECRET_KEY')
    expect(secretKeyUpsert).toBeDefined()
    expect(secretKeyUpsert![0].create.value).toBe('enc:sk_live_new_secret')
    expect(secretKeyUpsert![0].update.value).toBe('enc:sk_live_new_secret')

    const webhookUpsert = allUpsertArgs.find((args) => args[0].create.key === 'WEBHOOK_SECRET')
    expect(webhookUpsert).toBeDefined()
    expect(webhookUpsert![0].create.value).toBe('enc:whsec_live_new_secret')

    expect(status.state).toBe('CREDENTIALS_SAVED')
  })

  it('uses DB-saved Stripe credentials for verification instead of env fallback secrets', async () => {
    mocks.env.STRIPE_SECRET_KEY = 'sk_test_env_fallback_should_not_be_used'
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_env_fallback_should_not_be_used'
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_stripe_verify',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'SECRET_KEY', value: 'enc:sk_live_db_verify_1234' },
        { id: 'sec_2', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_db_verify_1234' },
        { id: 'sec_3', key: 'MODE', value: 'enc:live' },
      ],
    }])

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: 'acct_123',
          country: 'US',
          default_currency: 'usd',
          charges_enabled: true,
          payouts_enabled: true,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyProviderConnection('STRIPE')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/account',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_live_db_verify_1234',
        }),
      })
    )
    expect(result.verification.ok).toBe(true)
  })

  it('explains env fallback instead of "not configured" when only env Stripe credentials exist', async () => {
    mocks.env.STRIPE_SECRET_KEY = 'sk_test_env_only_verify'
    mocks.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_env_only_verify'
    mocks.prisma.integration.findMany.mockResolvedValue([])

    await expect(verifyProviderConnection('STRIPE')).rejects.toThrow(/\.env fallback credentials/i)
  })

  it('still reports "not configured" when neither db nor env Stripe credentials exist', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([])

    await expect(verifyProviderConnection('STRIPE')).rejects.toThrow(
      /not configured\. save credentials first/i
    )
  })

  it('surfaces an ENCRYPTION_KEY decrypt failure distinctly during verification', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_undecryptable',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-06T00:00:00.000Z'),
        updatedAt: new Date('2026-05-06T00:00:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_locked' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_locked' },
          { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        ],
      },
    ])

    mocks.decrypt.mockImplementation(() => {
      throw new Error('Unsupported state or unable to authenticate data')
    })

    try {
      await expect(verifyProviderConnection('STRIPE')).rejects.toThrow(
        /cannot be decrypted with the current ENCRYPTION_KEY/i
      )
    } finally {
      mocks.decrypt.mockImplementation((value: string) => value.replace(/^enc:/, ''))
    }
  })

  it('redacts Stripe, Shippo, EasyPost, and named credential values from provider errors', () => {
    const raw = 'Shippo rejected shippo_test_abc123; EasyPost EZAKabc123; apiKey=plain_candidate; bearer sk_test_abc123'
    const sanitized = sanitizeProviderError(raw)

    expect(sanitized).not.toContain('shippo_test_abc123')
    expect(sanitized).not.toContain('EZAKabc123')
    expect(sanitized).not.toContain('plain_candidate')
    expect(sanitized).not.toContain('sk_test_abc123')
    expect(sanitized).toContain('shippo_***')
    expect(sanitized).toContain('EZAK***')
  })

  it('reports unreadable Stripe credential storage without exposing ciphertext', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_unreadable_status',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-06T00:00:00.000Z'),
        updatedAt: new Date('2026-05-06T00:00:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_locked' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_locked' },
          { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        ],
      },
    ])
    mocks.decrypt.mockImplementation(() => {
      throw new Error('Unsupported state or unable to authenticate data')
    })

    try {
      const snapshot = await getStripeProviderStatusSnapshot()

      expect(snapshot).toMatchObject({
        credentialStorageState: 'UNREADABLE',
        configured: false,
        source: 'db',
      })
      expect(JSON.stringify(snapshot)).not.toContain('sk_test_locked')
    } finally {
      mocks.decrypt.mockImplementation((value: string) => value.replace(/^enc:/, ''))
    }
  })

  it('persists Stripe verification metadata for post-reload status/runtime reads', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_stripe_verify_meta',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'SECRET_KEY', value: 'enc:sk_live_db_verify_9876' },
        { id: 'sec_2', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_db_verify_9876' },
        { id: 'sec_3', key: 'MODE', value: 'enc:live' },
      ],
    }])

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          id: 'acct_verified_987',
          charges_enabled: true,
          payouts_enabled: true,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyProviderConnection('STRIPE')

    expect(result.verification.ok).toBe(true)
    const upsertKeys = (mocks.prisma.integrationSecret.upsert.mock.calls as Array<[any]>).map(
      ([arg]) => arg?.create?.key
    )
    expect(upsertKeys).toContain('META_VERIFIED_AT')
    expect(upsertKeys).toContain('META_LAST_VERIFIED_AT')
    expect(upsertKeys).toContain('META_VERIFICATION_DATA')
    expect(mocks.prisma.integrationSecret.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key: 'META_LAST_ERROR',
        }),
      })
    )
  })

  it('ignores masked Stripe placeholder submissions and keeps encrypted secrets unchanged', async () => {
    const existingIntegration = {
      id: 'int_stripe_masked_save',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:test' },
      ],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValue([existingIntegration])

    mocks.prisma.integration.update.mockResolvedValue({ id: 'int_stripe_masked_save' })

    await saveProviderCredentials('STRIPE', {
      publishableKey: 'pk_test_******1234',
      secretKey: 'sk_test_******5678',
      webhookSecret: 'whsec_******9012',
      mode: 'test',
    })

    const allUpserts = mocks.prisma.integrationSecret.upsert.mock.calls as Array<[any]>
    expect(allUpserts.some(([arg]) => String(arg?.create?.value || '').includes('••••'))).toBe(false)
    expect(allUpserts.some(([arg]) => arg?.create?.value === 'enc:pk_test_existing_1234')).toBe(true)
    expect(allUpserts.some(([arg]) => arg?.create?.value === 'enc:sk_test_existing_5678')).toBe(true)
    expect(allUpserts.some(([arg]) => arg?.create?.value === 'enc:whsec_existing_9012')).toBe(true)

    const status = await getProviderStatus('STRIPE')
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('sk_test_existing_5678')
    expect(serialized).not.toContain('whsec_existing_9012')
    const metaDeleteCalls = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).filter(
      ([arg]) => Array.isArray(arg?.where?.key?.in)
    )
    expect(metaDeleteCalls.length).toBe(0)
  })

  it('keeps Stripe API verification metadata when only webhookSecret is updated', async () => {
    const existingIntegration = {
      id: 'int_stripe_webhook_only',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T06:00:00.000Z'),
      updatedAt: new Date('2026-05-07T06:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:test' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T06:01:00.000Z' },
      ],
    }

    mocks.prisma.integration.findMany.mockResolvedValue([existingIntegration])

    const status = await saveProviderCredentials('STRIPE', {
      webhookSecret: 'whsec_updated_0000',
    })

    expect(status.state).toBe('VERIFIED')
    const webhookUpsert = (mocks.prisma.integrationSecret.upsert.mock.calls as Array<[any]>).find(
      ([arg]) => arg?.create?.key === 'WEBHOOK_SECRET'
    )
    expect(webhookUpsert?.[0]?.create?.value).toBe('enc:whsec_updated_0000')
    const metaDeleteCalls = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).filter(
      ([arg]) => Array.isArray(arg?.where?.key?.in)
    )
    expect(metaDeleteCalls.length).toBe(0)
  })

  it('returns Stripe masked metadata with prefix and last4 only', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_stripe_mask',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_abcdefghijklmnopqrstuvwxyz1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_abcdefghijklmnopqrstuvwxyz5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_abcdefghijklmnopqrstuvwxyz9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:test' },
      ],
    }])

    const status = await saveProviderCredentials('STRIPE', {
      publishableKey: 'pk_test_abcdefghijklmnopqrstuvwxyz1234',
      secretKey: 'sk_test_abcdefghijklmnopqrstuvwxyz5678',
      webhookSecret: 'whsec_abcdefghijklmnopqrstuvwxyz9012',
      mode: 'test',
    })

    const publishableMask = status.credentialMeta.find((entry) => entry.key === 'PUBLISHABLE_KEY')?.maskedValue
    const secretMask = status.credentialMeta.find((entry) => entry.key === 'SECRET_KEY')?.maskedValue
    const webhookMask = status.credentialMeta.find((entry) => entry.key === 'WEBHOOK_SECRET')?.maskedValue

    expect(String(publishableMask || '')).toMatch(/^pk_test_.+1234$/)
    expect(String(secretMask || '')).toMatch(/^sk_test_.+5678$/)
    expect(String(webhookMask || '')).toMatch(/^whsec_.+9012$/)
  })

  it('prefers the latest verified active Stripe set when duplicate active rows exist', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_newer_unverified',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-06T11:00:00.000Z'),
        updatedAt: new Date('2026-05-06T11:00:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_newer' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_live_newer' },
          { id: 'sec_3', key: 'MODE', value: 'enc:live' },
        ],
      },
      {
        id: 'int_stripe_older_verified',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-06T09:00:00.000Z'),
        updatedAt: new Date('2026-05-06T09:00:00.000Z'),
        secrets: [
          { id: 'sec_4', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_verified' },
          { id: 'sec_5', key: 'SECRET_KEY', value: 'enc:sk_live_verified' },
          { id: 'sec_6', key: 'MODE', value: 'enc:live' },
          { id: 'sec_7', key: 'WEBHOOK_SECRET', value: 'enc:whsec_live_verified' },
          { id: 'sec_8', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-06T10:00:00.000Z' },
        ],
      },
    ])

    const runtime = await getRuntimeProviderConnection('STRIPE')

    expect(runtime).toMatchObject({
      source: 'db',
      verified: true,
      credentials: {
        SECRET_KEY: 'sk_live_verified',
        PUBLISHABLE_KEY: 'pk_live_verified',
        WEBHOOK_SECRET: 'whsec_live_verified',
      },
    })
  })

  it('returns canonical Stripe provider snapshot with masked metadata only', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_snapshot',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-07T10:00:00.000Z'),
        updatedAt: new Date('2026-05-07T10:00:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_snapshot_1234' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_snapshot_5678' },
          { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_snapshot_9012' },
          { id: 'sec_4', key: 'MODE', value: 'enc:test' },
          { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T10:01:00.000Z' },
          {
            id: 'sec_6',
            key: 'META_VERIFICATION_DATA',
            value: 'enc:{"accountId":"acct_snapshot","chargesEnabled":true,"payoutsEnabled":false}',
          },
        ],
      },
    ])

    const snapshot = await getStripeProviderStatusSnapshot()

    expect(snapshot).toMatchObject({
      configured: true,
      verified: true,
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: true,
      webhookConfigured: true,
      accountId: 'acct_snapshot',
      chargesEnabled: true,
      payoutsEnabled: false,
      source: 'db',
      runtimeSource: 'db',
    })

    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('sk_test_snapshot_5678')
    expect(serialized).not.toContain('whsec_snapshot_9012')
  })

  it('rejects a Stripe mode-only update that disagrees with saved API keys', async () => {
    const existingIntegration = {
      id: 'int_stripe_mode_only',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T08:00:00.000Z'),
      updatedAt: new Date('2026-05-07T08:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_live_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_live_existing_5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:live' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T08:01:00.000Z' },
      ],
    }

    mocks.prisma.integration.findMany.mockResolvedValue([existingIntegration])

    await expect(saveProviderCredentials('STRIPE', { mode: 'test' })).rejects.toThrow(
      /mode must match the supplied publishable and secret keys/i
    )
    expect(mocks.prisma.integrationSecret.upsert).not.toHaveBeenCalled()
  })

  it('rejects Stripe API keys from different modes before persisting them', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([])

    await expect(
      saveProviderCredentials('STRIPE', {
        publishableKey: 'pk_test_mismatched_1234',
        secretKey: 'sk_live_mismatched_5678',
      })
    ).rejects.toThrow(/must use the same test or live mode/i)

    expect(mocks.prisma.integration.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed Stripe webhook secret before persisting it', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([])

    await expect(
      saveProviderCredentials('STRIPE', {
        publishableKey: 'pk_test_valid_1234',
        secretKey: 'sk_test_valid_5678',
        webhookSecret: 'not-a-stripe-webhook-secret',
      })
    ).rejects.toThrow(/webhookSecret must start with whsec_/i)

    expect(mocks.prisma.integration.create).not.toHaveBeenCalled()
  })

  it('clears Stripe verification metadata when publishableKey changes', async () => {
    const existingIntegration = {
      id: 'int_stripe_api_key_change',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T09:00:00.000Z'),
      updatedAt: new Date('2026-05-07T09:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:test' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T09:01:00.000Z' },
      ],
    }
    const postSaveIntegration = {
      ...existingIntegration,
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_changed_9999' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_4', key: 'MODE', value: 'enc:test' },
      ],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValue([postSaveIntegration])

    const status = await saveProviderCredentials('STRIPE', {
      publishableKey: 'pk_test_changed_9999',
    })

    expect(status.state).toBe('CREDENTIALS_SAVED')
    const metaDeleteCalls = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).filter(
      ([arg]) => Array.isArray(arg?.where?.key?.in)
    )
    expect(metaDeleteCalls.length).toBeGreaterThan(0)
    expect(metaDeleteCalls[0][0].where.key.in).toEqual(
      expect.arrayContaining(['META_VERIFIED_AT', 'META_LAST_VERIFIED_AT', 'META_LAST_ERROR', 'META_VERIFICATION_DATA'])
    )
  })

  it('returns db source with masked credential metadata after Stripe save for reload hydration', async () => {
    const savedIntegration = {
      id: 'int_stripe_status_after_save',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T09:30:00.000Z'),
      updatedAt: new Date('2026-05-07T09:30:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_saved_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_saved_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_saved_9012' },
      ],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValue([savedIntegration])

    const status = await saveProviderCredentials('STRIPE', {
      publishableKey: 'pk_test_saved_1234',
      secretKey: 'sk_test_saved_5678',
      mode: 'test',
      webhookSecret: 'whsec_saved_9012',
    })

    expect(status.source).toBe('db')
    expect(status.state).toBe('CREDENTIALS_SAVED')
    const publishableMask = status.credentialMeta.find((entry) => entry.key === 'PUBLISHABLE_KEY')?.maskedValue
    const secretMask = status.credentialMeta.find((entry) => entry.key === 'SECRET_KEY')?.maskedValue
    const webhookMask = status.credentialMeta.find((entry) => entry.key === 'WEBHOOK_SECRET')?.maskedValue
    expect(String(publishableMask || '')).toContain('pk_test_')
    expect(String(publishableMask || '')).toContain('1234')
    expect(String(secretMask || '')).toContain('sk_test_')
    expect(String(secretMask || '')).toContain('5678')
    expect(String(webhookMask || '')).toContain('whsec_')
    expect(String(webhookMask || '')).toContain('9012')
    expect(JSON.stringify(status)).not.toContain('sk_test_saved_5678')
    expect(JSON.stringify(status)).not.toContain('whsec_saved_9012')
  })

  it('preserves masked API credentials after webhook-only Stripe save', async () => {
    const existingIntegration = {
      id: 'int_stripe_webhook_preserve_masks',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T10:00:00.000Z'),
      updatedAt: new Date('2026-05-07T10:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_1111' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T10:01:00.000Z' },
      ],
    }
    const postSaveIntegration = {
      ...existingIntegration,
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_updated_2222' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T10:01:00.000Z' },
      ],
    }

    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValueOnce([existingIntegration])
      .mockResolvedValue([postSaveIntegration])

    const status = await saveProviderCredentials('STRIPE', {
      webhookSecret: 'whsec_updated_2222',
    })

    expect(status.state).toBe('VERIFIED')
    const publishableMask = status.credentialMeta.find((entry) => entry.key === 'PUBLISHABLE_KEY')?.maskedValue
    const secretMask = status.credentialMeta.find((entry) => entry.key === 'SECRET_KEY')?.maskedValue
    const webhookMask = status.credentialMeta.find((entry) => entry.key === 'WEBHOOK_SECRET')?.maskedValue
    expect(String(publishableMask || '')).toContain('pk_test_')
    expect(String(publishableMask || '')).toContain('1234')
    expect(String(secretMask || '')).toContain('sk_test_')
    expect(String(secretMask || '')).toContain('5678')
    expect(String(webhookMask || '')).toContain('whsec_')
    expect(String(webhookMask || '')).toContain('2222')
  })

  it('returns configured Stripe provider snapshot after db save', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_snapshot_after_save',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-07T11:00:00.000Z'),
        updatedAt: new Date('2026-05-07T11:00:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_saved_1234' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_saved_5678' },
          { id: 'sec_3', key: 'MODE', value: 'enc:test' },
          { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_saved_9012' },
        ],
      },
    ])

    const snapshot = await getStripeProviderStatusSnapshot()

    expect(snapshot.configured).toBe(true)
    expect(snapshot.source).toBe('db')
    expect(snapshot.hasPublishableKey).toBe(true)
    expect(snapshot.hasSecretKey).toBe(true)
    expect(snapshot.hasWebhookSecret).toBe(true)
    expect(String(snapshot.publishableKeyMasked || '')).toContain('pk_test_')
    expect(String(snapshot.secretKeyMasked || '')).toContain('sk_test_')
    expect(String(snapshot.webhookSecretMasked || '')).toContain('whsec_')
  })

  it('does not report NOT_CONFIGURED when Stripe credential metadata exists in db', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([
      {
        id: 'int_stripe_configured_state',
        type: 'PAYMENT_STRIPE',
        status: 'ACTIVE',
        createdAt: new Date('2026-05-07T11:15:00.000Z'),
        updatedAt: new Date('2026-05-07T11:15:00.000Z'),
        secrets: [
          { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_state_1234' },
          { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_state_5678' },
          { id: 'sec_3', key: 'MODE', value: 'enc:test' },
          { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_state_9012' },
        ],
      },
    ])

    const status = await getProviderStatus('STRIPE')

    expect(status.state).toBe('CREDENTIALS_SAVED')
    expect(status.source).toBe('db')
    expect(status.hasCredentials).toBe(true)
    expect(status.credentialMeta.find((entry) => entry.key === 'PUBLISHABLE_KEY')?.present).toBe(true)
    expect(status.credentialMeta.find((entry) => entry.key === 'SECRET_KEY')?.present).toBe(true)
    expect(status.credentialMeta.find((entry) => entry.key === 'MODE')?.present).toBe(true)
  })

  it('preserves Stripe secrets and verification metadata when save payload has no changed api fields', async () => {
    const existingIntegration = {
      id: 'int_stripe_noop_save',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-05-07T11:20:00.000Z'),
      updatedAt: new Date('2026-05-07T11:20:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_existing_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_existing_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'WEBHOOK_SECRET', value: 'enc:whsec_existing_9012' },
        { id: 'sec_5', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-05-07T11:21:00.000Z' },
      ],
    }

    mocks.prisma.integration.findMany.mockResolvedValue([existingIntegration])

    const status = await saveProviderCredentials('STRIPE', {
      mode: 'test',
    })

    expect(status.state).toBe('VERIFIED')
    const allUpserts = mocks.prisma.integrationSecret.upsert.mock.calls as Array<[any]>
    expect(allUpserts.some(([arg]) => arg?.create?.key === 'PUBLISHABLE_KEY')).toBe(true)
    expect(allUpserts.some(([arg]) => arg?.create?.key === 'SECRET_KEY')).toBe(true)
    expect(allUpserts.some(([arg]) => arg?.create?.key === 'WEBHOOK_SECRET')).toBe(true)
    const metaDeleteCalls = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).filter(
      ([arg]) => Array.isArray(arg?.where?.key?.in)
    )
    expect(metaDeleteCalls.length).toBe(0)
  })

  it('preserves verified Stripe runtime eligibility when a verification timeout is retryable', async () => {
    const integration = {
      id: 'int_stripe_retryable',
      providerKey: 'STRIPE',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
      updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_retryable_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_retryable_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-07-11T09:00:00.000Z' },
        { id: 'sec_5', key: 'META_VERIFICATION_DATA', value: 'enc:{"accountId":"acct_previous"}' },
      ],
    }
    mocks.prisma.integration.findMany.mockResolvedValue([integration])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')))

    const result = await verifyProviderConnection('STRIPE')

    expect(result.verification).toMatchObject({ ok: false, retryable: true })
    expect(result.status).toMatchObject({
      state: 'VERIFIED',
      verificationState: 'VERIFIED',
      runtimeEligible: true,
    })
    expect(mocks.prisma.integrationSecret.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ key: 'META_LAST_ATTEMPT_STATUS' }) })
    )
    const invalidation = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).some(
      ([arg]) => Array.isArray(arg?.where?.key?.in) && arg.where.key.in.includes('META_LAST_VERIFIED_AT')
    )
    expect(invalidation).toBe(false)
  })

  it('invalidates verified Stripe runtime eligibility only after a definitive credential rejection', async () => {
    const integration = {
      id: 'int_stripe_definitive',
      providerKey: 'STRIPE',
      type: 'PAYMENT_STRIPE',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
      updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'PUBLISHABLE_KEY', value: 'enc:pk_test_definitive_1234' },
        { id: 'sec_2', key: 'SECRET_KEY', value: 'enc:sk_test_definitive_5678' },
        { id: 'sec_3', key: 'MODE', value: 'enc:test' },
        { id: 'sec_4', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-07-11T09:00:00.000Z' },
      ],
    }
    mocks.prisma.integration.findMany.mockResolvedValue([integration])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid api key', { status: 401 })))

    const result = await verifyProviderConnection('STRIPE')

    expect(result.verification).toMatchObject({ ok: false, retryable: false })
    const invalidation = (mocks.prisma.integrationSecret.deleteMany.mock.calls as Array<[any]>).some(
      ([arg]) => Array.isArray(arg?.where?.key?.in) && arg.where.key.in.includes('META_LAST_VERIFIED_AT')
    )
    expect(invalidation).toBe(true)
  })

  it('tests a shipping candidate without persisting or invalidating the saved connection', async () => {
    const integration = {
      id: 'int_shippo_saved',
      providerKey: 'SHIPPO',
      type: 'SHIPPING_SHIPPO',
      status: 'ACTIVE',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
      updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      secrets: [
        { id: 'sec_1', key: 'API_KEY', value: 'enc:shippo_saved_key' },
        { id: 'sec_2', key: 'META_LAST_VERIFIED_AT', value: 'enc:2026-07-11T09:00:00.000Z' },
      ],
    }
    mocks.prisma.integration.findMany.mockResolvedValue([integration])
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'SHIPPO', integrationType: 'SHIPPING_SHIPPO', integrationId: 'int_shippo_saved',
      integrationStatus: 'ACTIVE', hasCredentials: true, connected: true, updatedAt: '2026-07-11T10:00:00.000Z',
    })
    mocks.testShippingProviderConnectionWithApiKey.mockResolvedValue({
      ok: false, message: 'Shippo authentication failed (401)', retryable: false,
    })

    const result = await verifyProviderConnection('SHIPPO', { candidateApiKey: 'shippo_candidate_key' })

    expect(mocks.testShippingProviderConnectionWithApiKey).toHaveBeenCalledWith('SHIPPO', 'shippo_candidate_key')
    expect(result.verification).toMatchObject({ ok: false, candidate: true, retryable: false })
    expect(mocks.prisma.integrationSecret.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.integrationSecret.deleteMany).not.toHaveBeenCalled()
  })
})


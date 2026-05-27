import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
  getStripeSavedStatusSnapshot: vi.fn(),
  getEmailSettingsStatusSnapshot: vi.fn(),
  getMediaStorageAdapter: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeSavedStatusSnapshot: mocks.getStripeSavedStatusSnapshot,
}))

vi.mock('@/server/email/email-settings-status.service', () => ({
  getEmailSettingsStatusSnapshot: mocks.getEmailSettingsStatusSnapshot,
}))

vi.mock('@/server/media/media-storage', async () => {
  const actual = await vi.importActual<typeof import('@/server/media/media-storage')>(
    '@/server/media/media-storage'
  )

  return {
    ...actual,
    getMediaStorageAdapter: mocks.getMediaStorageAdapter,
  }
})

import { MediaStorageConfigError } from '@/server/media/media-storage'
import { buildPublicStatusReport } from './public-status.service'

describe('buildPublicStatusReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    process.env.DATABASE_URL = 'postgresql://db_user:secret@localhost:5432/doopify'
    process.env.JWT_SECRET = 'super-strong-jwt-secret-value'
    process.env.WEBHOOK_RETRY_SECRET = 'super-strong-retry-secret-value'
    process.env.NEXT_PUBLIC_STORE_URL = 'https://shop.example.com'

    mocks.queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
    mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
      configured: true,
      checkoutKeysConfigured: true,
      source: 'db',
      mode: 'test',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      publishableKeyMasked: 'pk_test_******1234',
      secretKeyMasked: 'sk_test_******1234',
      webhookSecretMasked: 'whsec_******1234',
      lastVerifiedAt: '2026-05-22T00:00:00.000Z',
      lastError: null,
      verificationStatus: 'verified',
    })
    mocks.getEmailSettingsStatusSnapshot.mockResolvedValue({
      senderConfigured: true,
      providerConfigured: true,
      provider: 'RESEND',
      providerSource: 'db',
      lastVerifiedAt: '2026-05-22T00:00:00.000Z',
      lastError: null,
      verificationStatus: 'verified',
      jobHealthStatus: 'healthy',
    })
    mocks.getMediaStorageAdapter.mockReturnValue({
      provider: 'postgres',
    })
  })

  it('returns ok when app/db/required env checks pass', async () => {
    const report = await buildPublicStatusReport()

    expect(report.app).toBe('ok')
    expect(report.database).toBe('reachable')
    expect(report.requiredEnv.present).toEqual(expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET']))
    expect(report.requiredEnv.missing).toEqual([])
    expect(report.stripe).toBe('configured')
    expect(report.email).toBe('configured')
    expect(report.mediaStorage.provider).toBe('postgres')
  })

  it('marks database unreachable when database is unavailable', async () => {
    mocks.queryRawUnsafe.mockRejectedValueOnce(new Error('connect failed'))

    const report = await buildPublicStatusReport()

    expect(report.database).toBe('unreachable')
  })

  it('lists missing required env var names without values', async () => {
    delete process.env.JWT_SECRET

    const report = await buildPublicStatusReport()

    expect(report.requiredEnv.present).toContain('DATABASE_URL')
    expect(report.requiredEnv.missing).toContain('JWT_SECRET')
  })

  it('maps media config errors without exposing secrets', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_secret_should_not_leak'
    mocks.getMediaStorageAdapter.mockImplementationOnce(() => {
      throw new MediaStorageConfigError(
        's3',
        'MEDIA_STORAGE_PROVIDER=s3 requires MEDIA_S3_* variables.'
      )
    })

    const report = await buildPublicStatusReport()
    const serialized = JSON.stringify(report)

    expect(report.mediaStorage.provider).toBe('s3')
    expect(serialized).not.toContain('sk_test_secret_should_not_leak')
    expect(serialized).not.toContain('secret@localhost')
  })
})

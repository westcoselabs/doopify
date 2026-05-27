import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: {
      findFirst: vi.fn(),
    },
  },
  getProviderStatus: vi.fn(),
  getEmailJobHealthSnapshot: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/provider-connection.service', () => ({
  getProviderStatus: mocks.getProviderStatus,
}))

vi.mock('@/server/jobs/email-job-health.service', () => ({
  getEmailJobHealthSnapshot: mocks.getEmailJobHealthSnapshot,
}))

import { getEmailSettingsStatusSnapshot } from './email-settings-status.service'

describe('email settings status service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.store.findFirst.mockResolvedValue({ email: 'store@example.com' })
    mocks.getEmailJobHealthSnapshot.mockResolvedValue({ level: 'healthy' })
  })

  it('returns verified state when sender and db provider are configured + verified', async () => {
    mocks.getProviderStatus.mockImplementation(async (provider: string) => {
      if (provider === 'RESEND') {
        return {
          provider: 'RESEND',
          state: 'VERIFIED',
          source: 'db',
          hasCredentials: true,
          lastVerifiedAt: '2026-05-20T00:00:00.000Z',
          lastError: null,
        }
      }
      return {
        provider: 'SMTP',
        state: 'NOT_CONFIGURED',
        source: 'none',
        hasCredentials: false,
        lastVerifiedAt: null,
        lastError: null,
      }
    })

    const status = await getEmailSettingsStatusSnapshot()
    expect(status).toEqual(
      expect.objectContaining({
        senderConfigured: true,
        providerConfigured: true,
        provider: 'RESEND',
        providerSource: 'db',
        verificationStatus: 'verified',
        jobHealthStatus: 'healthy',
      })
    )
  })

  it('returns needs_setup when sender and provider config are missing', async () => {
    mocks.prisma.store.findFirst.mockResolvedValue({ email: null })
    mocks.getProviderStatus.mockResolvedValue({
      provider: 'RESEND',
      state: 'NOT_CONFIGURED',
      source: 'none',
      hasCredentials: false,
      lastVerifiedAt: null,
      lastError: null,
    })

    const status = await getEmailSettingsStatusSnapshot()
    expect(status.senderConfigured).toBe(false)
    expect(status.providerConfigured).toBe(false)
    expect(status.verificationStatus).toBe('needs_setup')
  })

  it('treats env fallback provider config as configured with verification warning', async () => {
    mocks.getProviderStatus.mockImplementation(async (provider: string) => {
      if (provider === 'RESEND') {
        return {
          provider: 'RESEND',
          state: 'CREDENTIALS_SAVED',
          source: 'env',
          hasCredentials: true,
          lastVerifiedAt: null,
          lastError: null,
        }
      }
      return {
        provider: 'SMTP',
        state: 'NOT_CONFIGURED',
        source: 'none',
        hasCredentials: false,
        lastVerifiedAt: null,
        lastError: null,
      }
    })

    const status = await getEmailSettingsStatusSnapshot()
    expect(status.providerConfigured).toBe(true)
    expect(status.providerSource).toBe('env')
    expect(status.verificationStatus).toBe('verification_unavailable')
  })

  it('returns needs_attention when db provider has verification error', async () => {
    mocks.getProviderStatus.mockImplementation(async (provider: string) => {
      if (provider === 'SMTP') {
        return {
          provider: 'SMTP',
          state: 'ERROR',
          source: 'db',
          hasCredentials: true,
          lastVerifiedAt: null,
          lastError: 'auth failed',
        }
      }
      return {
        provider: 'RESEND',
        state: 'NOT_CONFIGURED',
        source: 'none',
        hasCredentials: false,
        lastVerifiedAt: null,
        lastError: null,
      }
    })

    const status = await getEmailSettingsStatusSnapshot()
    expect(status.provider).toBe('SMTP')
    expect(status.providerConfigured).toBe(true)
    expect(status.verificationStatus).toBe('needs_attention')
  })

  it('returns unknown job health when health snapshot fails', async () => {
    mocks.getProviderStatus.mockImplementation(async () => ({
      provider: 'RESEND',
      state: 'VERIFIED',
      source: 'db',
      hasCredentials: true,
      lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      lastError: null,
    }))
    mocks.getEmailJobHealthSnapshot.mockRejectedValue(new Error('failed'))

    const status = await getEmailSettingsStatusSnapshot()
    expect(status.jobHealthStatus).toBe('unknown')
  })
})

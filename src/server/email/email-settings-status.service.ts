import { prisma } from '@/lib/prisma'
import {
  getProviderStatus,
  type ProviderStatus,
} from '@/server/services/provider-connection.service'
import { getEmailJobHealthSnapshot } from '@/server/jobs/email-job-health.service'

export type EmailVerificationStatus =
  | 'verified'
  | 'configured'
  | 'verification_unavailable'
  | 'needs_attention'
  | 'needs_setup'

export type EmailJobHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export type EmailSettingsStatus = {
  senderConfigured: boolean
  providerConfigured: boolean
  provider: 'RESEND' | 'SMTP' | 'NONE'
  providerSource: 'db' | 'env' | 'none'
  lastVerifiedAt: string | null
  lastError: string | null
  verificationStatus: EmailVerificationStatus
  jobHealthStatus: EmailJobHealthStatus
}

type EmailProviderStatus = ProviderStatus & { provider: 'RESEND' | 'SMTP' }

function normalize(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function toVerificationStatus(
  providerStatus: EmailProviderStatus | null,
  providerConfigured: boolean
): EmailVerificationStatus {
  if (!providerConfigured || !providerStatus) return 'needs_setup'
  if (providerStatus.source === 'env') return 'verification_unavailable'
  if (providerStatus.state === 'VERIFIED') return 'verified'
  if (providerStatus.state === 'ERROR') return 'needs_attention'
  if (providerStatus.state === 'CREDENTIALS_SAVED') return 'configured'
  return 'verification_unavailable'
}

function hasConfiguredProvider(status: EmailProviderStatus) {
  return status.hasCredentials && (status.source === 'db' || status.source === 'env')
}

function providerPriorityScore(status: EmailProviderStatus) {
  if (status.source === 'db' && status.state === 'VERIFIED') return 0
  if (status.source === 'db' && status.state === 'ERROR') return 1
  if (status.source === 'db' && status.state === 'CREDENTIALS_SAVED') return 2
  if (status.source === 'db' && status.hasCredentials) return 3
  if (status.source === 'env' && status.hasCredentials) return 4
  if (status.source === 'env') return 5
  return 6
}

function selectProviderStatus(statuses: EmailProviderStatus[]) {
  if (!statuses.length) return null
  const sorted = statuses.slice().sort((left, right) => providerPriorityScore(left) - providerPriorityScore(right))
  return sorted[0] || null
}

export async function getEmailSettingsStatusSnapshot(): Promise<EmailSettingsStatus> {
  const [store, resendStatus, smtpStatus, health] = await Promise.all([
    prisma.store.findFirst({
      select: {
        email: true,
      },
    }),
    getProviderStatus('RESEND'),
    getProviderStatus('SMTP'),
    getEmailJobHealthSnapshot().catch(() => null),
  ])

  const senderConfigured = Boolean(normalize(store?.email))
  const selectedProvider = selectProviderStatus([
    resendStatus as EmailProviderStatus,
    smtpStatus as EmailProviderStatus,
  ])
  const providerConfigured = Boolean(selectedProvider && hasConfiguredProvider(selectedProvider))
  const provider = selectedProvider?.provider || 'NONE'
  const verificationStatus = toVerificationStatus(selectedProvider, providerConfigured)

  return {
    senderConfigured,
    providerConfigured,
    provider,
    providerSource: selectedProvider?.source || 'none',
    lastVerifiedAt: selectedProvider?.lastVerifiedAt || null,
    lastError: selectedProvider?.lastError || null,
    verificationStatus,
    jobHealthStatus: health?.level || 'unknown',
  }
}

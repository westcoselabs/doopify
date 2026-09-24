import { env } from '@/lib/env'
import { findPrimaryStore } from '@/server/services/primary-store.service'
import { getEmailJobHealthSnapshot } from '@/server/jobs/email-job-health.service'
import { isTransactionalEmailConfigured } from './provider'

export type EmailSettingsStatus = {
  senderConfigured: boolean
  providerConfigured: boolean
  provider: 'RESEND' | 'SMTP' | 'NONE'
  jobHealthStatus: 'healthy' | 'warning' | 'critical' | 'unknown'
}

export async function getEmailSettingsStatusSnapshot(): Promise<EmailSettingsStatus> {
  const [store, health] = await Promise.all([
    findPrimaryStore({ select: { email: true } }),
    getEmailJobHealthSnapshot().catch(() => null),
  ])
  return {
    senderConfigured: Boolean(store?.email?.trim()),
    providerConfigured: isTransactionalEmailConfigured(),
    provider: env.EMAIL_PROVIDER === 'resend' ? 'RESEND' : env.EMAIL_PROVIDER === 'smtp' ? 'SMTP' : 'NONE',
    jobHealthStatus: health?.level || 'unknown',
  }
}

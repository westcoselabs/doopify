import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { getIntegrationStatuses } from '@/server/config/integration-status'
import { isTransactionalEmailConfigured } from '@/server/email/provider'

export async function buildPublicStatusReport() {
  let database: 'reachable' | 'unreachable' = 'reachable'
  try { await prisma.$queryRawUnsafe('SELECT 1') } catch { database = 'unreachable' }
  const stripe = getIntegrationStatuses().find((status) => status.id === 'stripe')!
  return {
    app: 'ok' as const,
    database,
    requiredEnv: { present: ['DATABASE_URL', 'JWT_SECRET'], missing: [] as string[] },
    stripe: stripe.configured ? 'configured' : 'not_configured',
    email: isTransactionalEmailConfigured() ? 'configured' : env.EMAIL_PROVIDER === 'none' ? 'optional' : 'not_configured',
    mediaStorage: { provider: env.MEDIA_STORAGE_PROVIDER },
    checkedAt: new Date().toISOString(),
  }
}

export type PublicStatusReport = Awaited<ReturnType<typeof buildPublicStatusReport>>

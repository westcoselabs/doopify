import { prisma } from '@/lib/prisma'
import { getEmailSettingsStatusSnapshot } from '@/server/email/email-settings-status.service'
import { getMediaStorageAdapter, MediaStorageConfigError } from '@/server/media/media-storage'
import { getStripeSavedStatusSnapshot } from '@/server/payments/stripe-runtime.service'
import { hasRealCredential } from '@/server/services/credential-readiness'

type DatabaseStatus = 'reachable' | 'unreachable'
type StripeStatus = 'configured' | 'not_configured' | 'unknown'
type EmailStatus = 'configured' | 'optional' | 'not_configured'
type RequiredEnvName = 'DATABASE_URL' | 'JWT_SECRET'

type MediaProvider = 'postgres' | 's3' | 'vercel-blob' | 'unknown'

export type PublicStatusReport = {
  app: 'ok'
  database: DatabaseStatus
  requiredEnv: {
    present: RequiredEnvName[]
    missing: RequiredEnvName[]
  }
  stripe: StripeStatus
  email: EmailStatus
  mediaStorage: {
    provider: MediaProvider
  }
  checkedAt: string
}

async function checkDatabaseReachable() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    return true
  } catch {
    return false
  }
}

function normalizeMediaProvider(value: unknown): MediaProvider {
  if (value === 'postgres') return 'postgres'
  if (value === 's3') return 's3'
  if (value === 'vercel-blob') return 'vercel-blob'
  return 'unknown'
}

const REQUIRED_ENV_NAMES: readonly RequiredEnvName[] = ['DATABASE_URL', 'JWT_SECRET']

function resolveRequiredEnvStatus() {
  const present: RequiredEnvName[] = []
  const missing: RequiredEnvName[] = []

  for (const name of REQUIRED_ENV_NAMES) {
    if (hasRealCredential(process.env[name])) {
      present.push(name)
    } else {
      missing.push(name)
    }
  }

  return { present, missing }
}

function resolveMediaProvider() {
  try {
    const provider = getMediaStorageAdapter().provider
    return {
      provider: normalizeMediaProvider(provider),
    }
  } catch (error) {
    if (error instanceof MediaStorageConfigError) {
      const provider =
        error.provider === 's3' || error.provider === 'vercel-blob'
          ? error.provider
          : 'unknown'
      return {
        provider: normalizeMediaProvider(provider),
      }
    }

    return {
      provider: 'unknown' as const,
    }
  }
}

export async function buildPublicStatusReport(): Promise<PublicStatusReport> {
  const [
    databaseReachable,
    stripeSnapshot,
    emailSnapshot,
  ] = await Promise.all([
    checkDatabaseReachable(),
    getStripeSavedStatusSnapshot().catch(() => null),
    getEmailSettingsStatusSnapshot().catch(() => null),
  ])

  const requiredEnv = resolveRequiredEnvStatus()
  const mediaStorage = resolveMediaProvider()
  const stripe: StripeStatus = stripeSnapshot
    ? stripeSnapshot.configured
      ? 'configured'
      : 'not_configured'
    : 'unknown'
  const email: EmailStatus = emailSnapshot
    ? emailSnapshot.providerConfigured
      ? 'configured'
      : emailSnapshot.providerSource === 'none'
        ? 'optional'
        : 'not_configured'
    : 'not_configured'

  return {
    app: 'ok',
    database: databaseReachable ? 'reachable' : 'unreachable',
    requiredEnv,
    stripe,
    email,
    mediaStorage,
    checkedAt: new Date().toISOString(),
  }
}

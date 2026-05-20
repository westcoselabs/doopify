import { env } from '@/lib/env'
import { hasRealCredential } from '@/server/services/credential-readiness'
import {
  getRuntimeProviderConnection,
  getStripeProviderStatusSnapshot,
  type StripeProviderStatusSnapshot,
} from '@/server/services/provider-connection.service'

export type StripeRuntimeSource = 'db' | 'env' | 'none'
export type StripeMode = 'test' | 'live' | null

export type StripeRuntimeConnection = {
  source: StripeRuntimeSource
  verified: boolean
  mode: StripeMode
  publishableKey: string | null
  secretKey: string | null
  webhookSecret: string | null
  accountId: string | null
  chargesEnabled: boolean | null
  payoutsEnabled: boolean | null
}

export type StripeWebhookSecretSelection = {
  source: StripeRuntimeSource
  webhookSecret: string | null
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeMode(value: unknown): StripeMode {
  const normalized = normalizeString(value)?.toLowerCase()
  if (normalized === 'test' || normalized === 'live') return normalized
  return null
}

function inferModeFromSecretKey(secretKey: string | null): StripeMode {
  if (!secretKey) return null
  if (secretKey.startsWith('sk_live_')) return 'live'
  if (secretKey.startsWith('sk_test_')) return 'test'
  return null
}

export async function getStripeProviderStatus(): Promise<StripeProviderStatusSnapshot> {
  return getStripeProviderStatusSnapshot()
}

export async function getStripeRuntimeConnection(): Promise<StripeRuntimeConnection> {
  const runtime = await getRuntimeProviderConnection('STRIPE')
  const credentials = runtime.credentials || {}

  const publishableKey = normalizeString(credentials.PUBLISHABLE_KEY)
  const secretKey = normalizeString(credentials.SECRET_KEY)
  const webhookSecret = normalizeString(credentials.WEBHOOK_SECRET)
  const mode = normalizeMode(credentials.MODE) ?? inferModeFromSecretKey(secretKey)

  if (runtime.source !== 'db' || !runtime.verified) {
    return {
      source: runtime.source,
      verified: false,
      mode,
      publishableKey,
      secretKey,
      webhookSecret,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    }
  }

  const status = await getStripeProviderStatusSnapshot()

  return {
    source: 'db',
    verified: true,
    mode,
    publishableKey,
    secretKey,
    webhookSecret,
    accountId: normalizeString(status.accountId),
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
  }
}

export async function getStripeWebhookSecretSelection(
  runtimeOverride?: StripeRuntimeConnection
): Promise<StripeWebhookSecretSelection> {
  const runtime = runtimeOverride ?? (await getStripeRuntimeConnection())
  if (runtime.source === 'db' && runtime.verified && runtime.webhookSecret) {
    return {
      source: 'db',
      webhookSecret: runtime.webhookSecret,
    }
  }

  const envWebhookSecret = normalizeString(env.STRIPE_WEBHOOK_SECRET)
  if (hasRealCredential(envWebhookSecret)) {
    return {
      source: 'env',
      webhookSecret: envWebhookSecret,
    }
  }

  return {
    source: 'none',
    webhookSecret: null,
  }
}

import { env } from '@/lib/env'
import { hasRealCredential } from '@/server/services/credential-readiness'
import {
  getRuntimeProviderConnection,
  getStripeProviderStatusSnapshot,
  maskCredential,
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

export type StripeRuntimeStatusBundle = {
  runtime: StripeRuntimeConnection
  providerStatus: StripeProviderStatusSnapshot
  providerStatusUnavailable: boolean
}

export type StripeVerificationStatus =
  | 'verified'
  | 'configured'
  | 'verification_unavailable'
  | 'needs_attention'
  | 'needs_setup'

export type StripeSavedStatusSnapshot = {
  configured: boolean
  checkoutKeysConfigured: boolean
  source: StripeRuntimeSource
  mode: StripeMode
  hasPublishableKey: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  publishableKeyMasked: string | null
  secretKeyMasked: string | null
  webhookSecretMasked: string | null
  lastVerifiedAt: string | null
  lastError: string | null
  verificationStatus: StripeVerificationStatus
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

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('timeout'))
    }, timeoutMs)
    task
      .then((value) => {
        clearTimeout(timeout)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeout)
        reject(error)
      })
  })
}

function fallbackStripeProviderStatus(input: {
  source: StripeRuntimeSource
  mode: StripeMode
  publishableKey: string | null
  secretKey: string | null
  webhookSecret: string | null
  verified: boolean
  reason?: string | null
}): StripeProviderStatusSnapshot {
  const hasPublishableKey = Boolean(input.publishableKey)
  const hasSecretKey = Boolean(input.secretKey)
  const hasWebhookSecret = Boolean(input.webhookSecret)

  return {
    configured: hasPublishableKey && hasSecretKey,
    verified: input.verified,
    mode: input.mode,
    publishableKeyMasked: maskCredential('STRIPE', 'PUBLISHABLE_KEY', input.publishableKey),
    secretKeyMasked: maskCredential('STRIPE', 'SECRET_KEY', input.secretKey),
    webhookSecretMasked: maskCredential('STRIPE', 'WEBHOOK_SECRET', input.webhookSecret),
    hasPublishableKey,
    hasSecretKey,
    hasWebhookSecret,
    webhookConfigured: hasWebhookSecret,
    accountId: null,
    chargesEnabled: null,
    payoutsEnabled: null,
    lastVerifiedAt: null,
    lastError: input.reason || null,
    source: input.source,
    runtimeSource: input.source,
  }
}

function deriveStripeVerificationStatus(input: {
  source: StripeRuntimeSource
  hasPublishableKey: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  lastVerifiedAt: string | null
  lastError: string | null
}): StripeVerificationStatus {
  if (!input.hasPublishableKey || !input.hasSecretKey || !input.hasWebhookSecret) {
    return 'needs_setup'
  }

  if (input.lastError) return 'needs_attention'
  if (input.lastVerifiedAt) return 'verified'
  if (input.source === 'env') return 'verification_unavailable'
  return 'configured'
}

export async function getStripeSavedStatusSnapshot(): Promise<StripeSavedStatusSnapshot> {
  const [snapshot, runtime] = await Promise.all([
    getStripeProviderStatusSnapshot(),
    getRuntimeProviderConnection('STRIPE'),
  ])

  const runtimeCredentials = runtime.credentials || {}
  const runtimePublishableKey = normalizeString(runtimeCredentials.PUBLISHABLE_KEY)
  const runtimeSecretKey = normalizeString(runtimeCredentials.SECRET_KEY)
  const runtimeWebhookSecret = normalizeString(runtimeCredentials.WEBHOOK_SECRET)

  const hasPublishableKey =
    snapshot.hasPublishableKey || (snapshot.source !== 'db' && Boolean(runtimePublishableKey))
  const hasSecretKey = snapshot.hasSecretKey || (snapshot.source !== 'db' && Boolean(runtimeSecretKey))
  const hasWebhookSecret =
    snapshot.hasWebhookSecret || (snapshot.source !== 'db' && Boolean(runtimeWebhookSecret))

  const mode =
    snapshot.mode ??
    normalizeMode(runtimeCredentials.MODE) ??
    inferModeFromSecretKey(runtimeSecretKey)

  const publishableKeyMasked =
    snapshot.publishableKeyMasked ||
    maskCredential('STRIPE', 'PUBLISHABLE_KEY', runtimePublishableKey)
  const secretKeyMasked =
    snapshot.secretKeyMasked ||
    maskCredential('STRIPE', 'SECRET_KEY', runtimeSecretKey)
  const webhookSecretMasked =
    snapshot.webhookSecretMasked ||
    maskCredential('STRIPE', 'WEBHOOK_SECRET', runtimeWebhookSecret)

  const checkoutKeysConfigured = hasPublishableKey && hasSecretKey
  const configured = checkoutKeysConfigured && hasWebhookSecret
  const lastVerifiedAt = snapshot.lastVerifiedAt || null
  const lastError = snapshot.lastError || null

  return {
    configured,
    checkoutKeysConfigured,
    source: snapshot.source,
    mode,
    hasPublishableKey,
    hasSecretKey,
    hasWebhookSecret,
    publishableKeyMasked,
    secretKeyMasked,
    webhookSecretMasked,
    lastVerifiedAt,
    lastError,
    verificationStatus: deriveStripeVerificationStatus({
      source: snapshot.source,
      hasPublishableKey,
      hasSecretKey,
      hasWebhookSecret,
      lastVerifiedAt,
      lastError,
    }),
  }
}

export async function getStripeProviderStatus(): Promise<StripeProviderStatusSnapshot> {
  return getStripeProviderStatusSnapshot()
}

export async function getStripeRuntimeStatusBundle(options?: {
  providerStatusTimeoutMs?: number
}): Promise<StripeRuntimeStatusBundle> {
  const runtime = await getRuntimeProviderConnection('STRIPE')
  const credentials = runtime.credentials || {}

  const publishableKey = normalizeString(credentials.PUBLISHABLE_KEY)
  const secretKey = normalizeString(credentials.SECRET_KEY)
  const webhookSecret = normalizeString(credentials.WEBHOOK_SECRET)
  const mode = normalizeMode(credentials.MODE) ?? inferModeFromSecretKey(secretKey)

  const runtimeConnection: StripeRuntimeConnection = {
    source: runtime.source,
    verified: runtime.verified,
    mode,
    publishableKey,
    secretKey,
    webhookSecret,
    accountId: null,
    chargesEnabled: null,
    payoutsEnabled: null,
  }

  if (runtime.source !== 'db' || !runtime.verified) {
    return {
      runtime: runtimeConnection,
      providerStatus: fallbackStripeProviderStatus({
        source: runtime.source,
        mode,
        publishableKey,
        secretKey,
        webhookSecret,
        verified: false,
      }),
      providerStatusUnavailable: false,
    }
  }

  try {
    const status = await withTimeout(
      getStripeProviderStatusSnapshot(),
      Number(options?.providerStatusTimeoutMs ?? 0)
    )
    return {
      runtime: {
        ...runtimeConnection,
        source: 'db',
        verified: true,
        accountId: normalizeString(status.accountId),
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
      },
      providerStatus: status,
      providerStatusUnavailable: false,
    }
  } catch {
    return {
      runtime: runtimeConnection,
      providerStatus: fallbackStripeProviderStatus({
        source: runtime.source,
        mode,
        publishableKey,
        secretKey,
        webhookSecret,
        verified: runtime.verified,
        reason: 'Stripe provider snapshot timed out or failed.',
      }),
      providerStatusUnavailable: true,
    }
  }
}

export async function getStripeRuntimeConnection(): Promise<StripeRuntimeConnection> {
  const bundle = await getStripeRuntimeStatusBundle()
  return bundle.runtime
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

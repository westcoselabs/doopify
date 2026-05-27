import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import {
  connectShippingProvider,
  disconnectShippingProvider,
  getShippingProviderConnectionStatus,
  testShippingProviderConnection,
} from '@/server/shipping/shipping-provider.service'
import { hasRealCredential, normalizeCredential } from '@/server/services/credential-readiness'
import { decrypt, encrypt } from '@/server/utils/crypto'

export type SupportedProvider = 'SHIPPO' | 'EASYPOST' | 'RESEND' | 'SMTP' | 'STRIPE'
export type ProviderCategory = 'SHIPPING' | 'EMAIL' | 'PAYMENT'
export type ProviderConnectionState = 'NOT_CONFIGURED' | 'CREDENTIALS_SAVED' | 'VERIFIED' | 'ERROR'
export type ProviderSource = 'db' | 'env' | 'none'

type ProviderConfig = {
  category: ProviderCategory
  integrationType: string
  displayName: string
  requiredSecretKeys: string[]
  optionalSecretKeys: string[]
}

const PROVIDER_CONFIG: Record<SupportedProvider, ProviderConfig> = {
  SHIPPO: {
    category: 'SHIPPING',
    integrationType: 'SHIPPING_SHIPPO',
    displayName: 'Shippo Shipping',
    requiredSecretKeys: ['API_KEY'],
    optionalSecretKeys: [],
  },
  EASYPOST: {
    category: 'SHIPPING',
    integrationType: 'SHIPPING_EASYPOST',
    displayName: 'EasyPost Shipping',
    requiredSecretKeys: ['API_KEY'],
    optionalSecretKeys: [],
  },
  RESEND: {
    category: 'EMAIL',
    integrationType: 'EMAIL_RESEND',
    displayName: 'Resend Email',
    requiredSecretKeys: ['API_KEY'],
    optionalSecretKeys: ['WEBHOOK_SECRET', 'FROM_EMAIL'],
  },
  SMTP: {
    category: 'EMAIL',
    integrationType: 'EMAIL_SMTP',
    displayName: 'SMTP Email',
    requiredSecretKeys: ['HOST', 'PORT', 'SECURE', 'USERNAME', 'PASSWORD'],
    optionalSecretKeys: ['FROM_EMAIL'],
  },
  STRIPE: {
    category: 'PAYMENT',
    integrationType: 'PAYMENT_STRIPE',
    displayName: 'Stripe Payments',
    requiredSecretKeys: ['PUBLISHABLE_KEY', 'SECRET_KEY', 'MODE'],
    optionalSecretKeys: ['WEBHOOK_SECRET'],
  },
}

const META_VERIFIED_AT = 'META_VERIFIED_AT'
const META_LAST_VERIFIED_AT = 'META_LAST_VERIFIED_AT'
const META_LAST_ERROR = 'META_LAST_ERROR'
const META_VERIFICATION_DATA = 'META_VERIFICATION_DATA'
const MASK_TOKEN = '******'

const KNOWN_PROVIDERS = new Set<SupportedProvider>(Object.keys(PROVIDER_CONFIG) as SupportedProvider[])

function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/(sk|pk|rk|re|whsec)_[A-Za-z0-9_-]+/g, '$1_***')
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer ***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)
}

function trimToNull(value: unknown) {
  return normalizeCredential(value)
}

function isMaskedCredentialPlaceholder(value: string | null) {
  if (!value) return false
  const normalized = value.trim()
  if (!normalized) return false
  if (!/(?:\*{3,}|\u2022{3,}|\.{3,})/.test(normalized)) return false
  return (
    normalized.startsWith('pk_') ||
    normalized.startsWith('sk_') ||
    normalized.startsWith('whsec_') ||
    normalized.startsWith('re_')
  )
}

function normalizeProviderKey(input: string) {
  return input.trim().toUpperCase()
}

export function parseSupportedProvider(input: string): SupportedProvider | null {
  const normalized = normalizeProviderKey(input) as SupportedProvider
  return KNOWN_PROVIDERS.has(normalized) ? normalized : null
}

function isShippingProvider(provider: SupportedProvider): provider is 'SHIPPO' | 'EASYPOST' {
  return provider === 'SHIPPO' || provider === 'EASYPOST'
}

type ProviderIntegrationRecord = {
  id: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: Date
  updatedAt: Date
  secrets: Array<{
    id: string
    key: string
    value: string
  }>
}

async function listProviderIntegrations(provider: SupportedProvider): Promise<ProviderIntegrationRecord[]> {
  return prisma.integration.findMany({
    where: {
      type: PROVIDER_CONFIG[provider].integrationType,
    },
    include: {
      secrets: {
        select: {
          id: true,
          key: true,
          value: true,
        },
      },
    },
    orderBy: [
      {
        updatedAt: 'desc',
      },
      {
        createdAt: 'desc',
      },
    ],
  })
}

function sortByRecency<T extends { updatedAt: Date; createdAt: Date }>(left: T, right: T) {
  return right.updatedAt.getTime() - left.updatedAt.getTime() || right.createdAt.getTime() - left.createdAt.getTime()
}

function pickPreferredActiveProviderIntegration(
  provider: SupportedProvider,
  integrations: ProviderIntegrationRecord[]
) {
  const activeIntegrations = integrations.filter((integration) => integration.status === 'ACTIVE')
  if (!activeIntegrations.length) return null

  const activeWithMeta = activeIntegrations.map((integration) => {
    const secretMap = buildSecretMap(integration.secrets)
    const verification = extractVerificationMeta(secretMap)
    const hasCredentials = hasRequiredSecrets(provider, secretMap)
    return {
      integration,
      hasCredentials,
      verified: Boolean(verification.lastVerifiedAt),
    }
  })

  const verifiedCredentialed = activeWithMeta
    .filter((entry) => entry.hasCredentials && entry.verified)
    .map((entry) => entry.integration)
    .sort(sortByRecency)
  if (verifiedCredentialed.length) return verifiedCredentialed[0]

  const credentialed = activeWithMeta
    .filter((entry) => entry.hasCredentials)
    .map((entry) => entry.integration)
    .sort(sortByRecency)
  if (credentialed.length) return credentialed[0]

  return [...activeIntegrations].sort(sortByRecency)[0]
}

async function findPreferredProviderIntegration(provider: SupportedProvider) {
  const integrations = await listProviderIntegrations(provider)
  if (!integrations.length) return null

  const preferredActive = pickPreferredActiveProviderIntegration(provider, integrations)
  if (preferredActive) return preferredActive

  return [...integrations].sort(sortByRecency)[0]
}

function buildSecretMap(secrets: Array<{ key: string; value: string }>) {
  const map = new Map<string, string>()
  for (const secret of secrets) {
    map.set(secret.key, secret.value)
  }
  return map
}

function extractDecryptedSecret(secretMap: Map<string, string>, key: string) {
  const encryptedValue = secretMap.get(key)
  if (!encryptedValue) return null

  try {
    return decrypt(encryptedValue)
  } catch {
    return null
  }
}

function extractVerificationMeta(secretMap: Map<string, string>) {
  const verifiedAt = extractDecryptedSecret(secretMap, META_VERIFIED_AT)
  const lastVerifiedAt = extractDecryptedSecret(secretMap, META_LAST_VERIFIED_AT)
  const lastError = extractDecryptedSecret(secretMap, META_LAST_ERROR)
  const verificationDataRaw = extractDecryptedSecret(secretMap, META_VERIFICATION_DATA)

  let verificationData: Record<string, unknown> | null = null
  if (verificationDataRaw) {
    try {
      const parsed = JSON.parse(verificationDataRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        verificationData = parsed as Record<string, unknown>
      }
    } catch {
      verificationData = null
    }
  }

  return {
    verifiedAt: verifiedAt || lastVerifiedAt || null,
    lastVerifiedAt: lastVerifiedAt || verifiedAt || null,
    lastError: lastError || null,
    verificationData,
  }
}

function hasRequiredSecrets(provider: SupportedProvider, secretMap: Map<string, string>) {
  if (provider === 'STRIPE') {
    const publishableKey = extractDecryptedSecret(secretMap, 'PUBLISHABLE_KEY')
    const secretKey = extractDecryptedSecret(secretMap, 'SECRET_KEY')
    const mode = extractDecryptedSecret(secretMap, 'MODE')
    const inferredMode = secretKey?.startsWith('sk_live_') ? 'live' : secretKey?.startsWith('sk_test_') ? 'test' : null

    return (
      hasRealCredential(publishableKey) &&
      hasRealCredential(secretKey) &&
      (hasRealCredential(mode) || Boolean(inferredMode))
    )
  }

  const required = PROVIDER_CONFIG[provider].requiredSecretKeys
  return required.every((key) => hasRealCredential(extractDecryptedSecret(secretMap, key)))
}

function deriveConnectionState(input: {
  hasIntegration: boolean
  hasCredentials: boolean
  lastVerifiedAt: string | null
  lastError: string | null
}) {
  if (!input.hasIntegration || !input.hasCredentials) return 'NOT_CONFIGURED' as const
  if (input.lastError) return 'ERROR' as const
  if (input.lastVerifiedAt) return 'VERIFIED' as const
  return 'CREDENTIALS_SAVED' as const
}

export function maskCredential(provider: SupportedProvider, key: string, value: string | null) {
  if (!value) return null

  if (key === 'MODE' && provider === 'STRIPE') return value
  if (key === 'PORT') return value
  if (key === 'SECURE') return value
  if (key === 'FROM_EMAIL') return value
  if (key === 'HOST') return value

  const suffix = value.length >= 4 ? value.slice(-4) : value
  if (key === 'PUBLISHABLE_KEY' && provider === 'STRIPE') {
    if (value.startsWith('pk_test_')) return `pk_test_${MASK_TOKEN}${suffix}`
    if (value.startsWith('pk_live_')) return `pk_live_${MASK_TOKEN}${suffix}`
    return `pk_${MASK_TOKEN}${suffix}`
  }

  if (key === 'SECRET_KEY' && provider === 'STRIPE') {
    if (value.startsWith('sk_test_')) return `sk_test_${MASK_TOKEN}${suffix}`
    if (value.startsWith('sk_live_')) return `sk_live_${MASK_TOKEN}${suffix}`
    return `sk_${MASK_TOKEN}${suffix}`
  }

  if (key === 'WEBHOOK_SECRET' && value.startsWith('whsec_')) {
    return `whsec_${MASK_TOKEN}${suffix}`
  }

  if (key === 'API_KEY' && provider === 'RESEND' && value.startsWith('re_')) {
    return `re_${MASK_TOKEN}${suffix}`
  }

  if (value.length <= 6) return '****'
  return `${value.slice(0, 4)}${MASK_TOKEN}${suffix}`
}

function safeCredentialMetadata(provider: SupportedProvider, secretMap: Map<string, string>) {
  const config = PROVIDER_CONFIG[provider]
  const keys = [...config.requiredSecretKeys, ...config.optionalSecretKeys]

  return keys.map((key) => {
    const decryptedValue = extractDecryptedSecret(secretMap, key)
    return {
      key,
      present: Boolean(decryptedValue),
      maskedValue: maskCredential(provider, key, decryptedValue),
    }
  })
}

async function updateVerificationMeta(input: {
  integrationId: string
  verified: boolean
  errorMessage?: string
  verificationData?: Record<string, unknown> | null
}) {
  await prisma.$transaction(async (tx) => {
    if (input.verified) {
      const verifiedAtValue = encrypt(new Date().toISOString())
      const verificationDataValue = input.verificationData
        ? encrypt(JSON.stringify(input.verificationData))
        : null

      await tx.integrationSecret.upsert({
        where: {
          integrationId_key: {
            integrationId: input.integrationId,
            key: META_VERIFIED_AT,
          },
        },
        create: {
          integrationId: input.integrationId,
          key: META_VERIFIED_AT,
          value: verifiedAtValue,
        },
        update: {
          value: verifiedAtValue,
        },
      })

      await tx.integrationSecret.upsert({
        where: {
          integrationId_key: {
            integrationId: input.integrationId,
            key: META_LAST_VERIFIED_AT,
          },
        },
        create: {
          integrationId: input.integrationId,
          key: META_LAST_VERIFIED_AT,
          value: verifiedAtValue,
        },
        update: {
          value: verifiedAtValue,
        },
      })

      if (verificationDataValue) {
        await tx.integrationSecret.upsert({
          where: {
            integrationId_key: {
              integrationId: input.integrationId,
              key: META_VERIFICATION_DATA,
            },
          },
          create: {
            integrationId: input.integrationId,
            key: META_VERIFICATION_DATA,
            value: verificationDataValue,
          },
          update: {
            value: verificationDataValue,
          },
        })
      }

      await tx.integrationSecret.deleteMany({
        where: {
          integrationId: input.integrationId,
          key: META_LAST_ERROR,
        },
      })

      return
    }

    const errorText = sanitizeProviderError(input.errorMessage || 'Provider verification failed')
    await tx.integrationSecret.upsert({
      where: {
        integrationId_key: {
          integrationId: input.integrationId,
          key: META_LAST_ERROR,
        },
      },
      create: {
        integrationId: input.integrationId,
        key: META_LAST_ERROR,
        value: encrypt(errorText),
      },
      update: {
        value: encrypt(errorText),
      },
    })

    await tx.integrationSecret.deleteMany({
      where: {
        integrationId: input.integrationId,
        key: {
          in: [META_VERIFIED_AT, META_LAST_VERIFIED_AT, META_VERIFICATION_DATA],
        },
      },
    })
  })
}

function normalizeStripeMode(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (normalized === 'test' || normalized === 'live') return normalized
  throw new Error('Stripe mode must be "test" or "live"')
}

function normalizeCredentialInput(provider: SupportedProvider, input: Record<string, unknown>) {
  if (isShippingProvider(provider)) {
    const apiKey = trimToNull(input.apiKey)
    if (!apiKey) {
      throw new Error('apiKey is required')
    }

    return {
      API_KEY: apiKey,
    }
  }

  if (provider === 'RESEND') {
    const apiKey = trimToNull(input.apiKey)
    if (!apiKey) throw new Error('apiKey is required')

    const normalized: Record<string, string> = {
      API_KEY: apiKey,
    }

    const webhookSecret = trimToNull(input.webhookSecret)
    if (webhookSecret) normalized.WEBHOOK_SECRET = webhookSecret

    const fromEmail = trimToNull(input.fromEmail)
    if (fromEmail) normalized.FROM_EMAIL = fromEmail

    return normalized
  }

  if (provider === 'SMTP') {
    const host = trimToNull(input.host)
    const username = trimToNull(input.username)
    const password = trimToNull(input.password)
    const portRaw = Number(input.port)
    const secureRaw = Boolean(input.secure)

    if (!host) throw new Error('host is required')
    if (!Number.isInteger(portRaw) || portRaw <= 0 || portRaw > 65535) {
      throw new Error('port must be a valid integer between 1 and 65535')
    }
    if (!username) throw new Error('username is required')
    if (!password) throw new Error('password is required')

    const normalized: Record<string, string> = {
      HOST: host,
      PORT: String(portRaw),
      SECURE: secureRaw ? 'true' : 'false',
      USERNAME: username,
      PASSWORD: password,
    }

    const fromEmail = trimToNull(input.fromEmail)
    if (fromEmail) normalized.FROM_EMAIL = fromEmail

    return normalized
  }

  const publishableKey = trimToNull(input.publishableKey)
  const secretKey = trimToNull(input.secretKey)
  const webhookSecret = trimToNull(input.webhookSecret)
  const normalized: Record<string, string> = {}

  if (publishableKey && !isMaskedCredentialPlaceholder(publishableKey)) {
    normalized.PUBLISHABLE_KEY = publishableKey
  }

  if (secretKey && !isMaskedCredentialPlaceholder(secretKey)) {
    normalized.SECRET_KEY = secretKey
  }

  if (webhookSecret && !isMaskedCredentialPlaceholder(webhookSecret) && hasRealCredential(webhookSecret)) {
    normalized.WEBHOOK_SECRET = webhookSecret
  }

  if (input.mode != null) {
    normalized.MODE = normalizeStripeMode(input.mode)
  }

  return normalized
}

async function upsertProviderIntegrationCredentials(input: {
  provider: SupportedProvider
  normalizedCredentials: Record<string, string>
  clearVerificationMeta?: boolean
}) {
  const { provider, normalizedCredentials } = input
  const clearVerificationMeta = input.clearVerificationMeta ?? true
  const config = PROVIDER_CONFIG[provider]

  await prisma.$transaction(async (tx) => {
    const existingIntegrations = await tx.integration.findMany({
      where: {
        type: config.integrationType,
      },
      include: {
        secrets: {
          select: {
            id: true,
            key: true,
            value: true,
          },
        },
      },
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    })
    const existing = pickPreferredActiveProviderIntegration(
      provider,
      existingIntegrations as ProviderIntegrationRecord[]
    )

    const integration =
      existing != null
        ? await tx.integration.update({
            where: {
              id: existing.id,
            },
            data: {
              name: config.displayName,
              status: 'ACTIVE',
              type: config.integrationType,
            },
            select: {
              id: true,
            },
          })
        : await tx.integration.create({
            data: {
              name: config.displayName,
              status: 'ACTIVE',
              type: config.integrationType,
            },
            select: {
              id: true,
            },
          })

    for (const [key, value] of Object.entries(normalizedCredentials)) {
      await tx.integrationSecret.upsert({
        where: {
          integrationId_key: {
            integrationId: integration.id,
            key,
          },
        },
        create: {
          integrationId: integration.id,
          key,
          value: encrypt(value),
        },
        update: {
          value: encrypt(value),
        },
      })
    }

    if (clearVerificationMeta) {
      await tx.integrationSecret.deleteMany({
        where: {
          integrationId: integration.id,
          key: {
            in: [META_VERIFIED_AT, META_LAST_VERIFIED_AT, META_LAST_ERROR, META_VERIFICATION_DATA],
          },
        },
      })
    }

    await tx.integration.updateMany({
      where: {
        type: config.integrationType,
        id: {
          not: integration.id,
        },
      },
      data: {
        status: 'INACTIVE',
      },
    })
  })
}

type RuntimeConnection = {
  source: ProviderSource
  provider: SupportedProvider
  verified: boolean
  credentials: Record<string, string> | null
}

function getEnvFallback(provider: SupportedProvider): Record<string, string> | null {
  if (provider === 'STRIPE') {
    const secretKey = normalizeCredential(env.STRIPE_SECRET_KEY)
    const publishableKey = normalizeCredential(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    const webhookSecret = normalizeCredential(env.STRIPE_WEBHOOK_SECRET)

    if (!secretKey || !publishableKey || !hasRealCredential(secretKey) || !hasRealCredential(publishableKey)) {
      return null
    }

    return {
      SECRET_KEY: secretKey,
      PUBLISHABLE_KEY: publishableKey,
      WEBHOOK_SECRET: hasRealCredential(webhookSecret) ? String(webhookSecret) : '',
      MODE: secretKey.startsWith('sk_live_') ? 'live' : 'test',
    }
  }

  if (provider === 'RESEND') {
    const apiKey = normalizeCredential(env.RESEND_API_KEY)
    const webhookSecret = normalizeCredential(env.RESEND_WEBHOOK_SECRET)
    if (!apiKey || !hasRealCredential(apiKey)) return null

    return {
      API_KEY: apiKey,
      WEBHOOK_SECRET: hasRealCredential(webhookSecret) ? String(webhookSecret) : '',
    }
  }

  if (provider === 'SMTP') {
    const host = trimToNull(process.env.SMTP_HOST)
    const port = trimToNull(process.env.SMTP_PORT)
    const username = trimToNull(process.env.SMTP_USERNAME)
    const password = trimToNull(process.env.SMTP_PASSWORD)

    if (!host || !port || !username || !password) return null

    return {
      HOST: host,
      PORT: port,
      SECURE: trimToNull(process.env.SMTP_SECURE) || 'false',
      USERNAME: username,
      PASSWORD: password,
      FROM_EMAIL: trimToNull(process.env.SMTP_FROM_EMAIL) || '',
    }
  }

  if (provider === 'SHIPPO') {
    const apiKey = trimToNull(process.env.SHIPPO_API_KEY)
    return apiKey ? { API_KEY: apiKey } : null
  }

  const apiKey = trimToNull(process.env.EASYPOST_API_KEY)
  return apiKey ? { API_KEY: apiKey } : null
}

function getDecryptedCredentials(provider: SupportedProvider, secretMap: Map<string, string>) {
  const config = PROVIDER_CONFIG[provider]
  const keys = [...config.requiredSecretKeys, ...config.optionalSecretKeys]
  const credentials: Record<string, string> = {}

  for (const key of keys) {
    const value = extractDecryptedSecret(secretMap, key)
    if (value != null) {
      credentials[key] = value
    }
  }

  return credentials
}

async function getRuntimeProviderConnectionInternal(provider: SupportedProvider): Promise<RuntimeConnection> {
  const integration = await findPreferredProviderIntegration(provider)

  if (integration && integration.status === 'ACTIVE') {
    const secretMap = buildSecretMap(integration.secrets)
    const hasCredentials = hasRequiredSecrets(provider, secretMap)
    const verification = extractVerificationMeta(secretMap)

    if (hasCredentials && verification.lastVerifiedAt) {
      return {
        source: 'db',
        provider,
        verified: true,
        credentials: getDecryptedCredentials(provider, secretMap),
      }
    }

    // Shipping already has a shipped runtime path that uses active encrypted credentials.
    // Keep that compatibility while still preferring explicit verification first.
    if (hasCredentials && isShippingProvider(provider)) {
      return {
        source: 'db',
        provider,
        verified: false,
        credentials: getDecryptedCredentials(provider, secretMap),
      }
    }
  }

  const envFallback = getEnvFallback(provider)
  if (envFallback) {
    return {
      source: 'env',
      provider,
      verified: false,
      credentials: envFallback,
    }
  }

  return {
    source: 'none',
    provider,
    verified: false,
    credentials: null,
  }
}

export async function getRuntimeProviderConnection(provider: SupportedProvider): Promise<RuntimeConnection> {
  return getRuntimeProviderConnectionInternal(provider)
}

export async function getActiveProviderCredentials(provider: SupportedProvider) {
  const runtime = await getRuntimeProviderConnection(provider)
  return runtime.credentials
}

export type ProviderStatus = {
  provider: SupportedProvider
  category: ProviderCategory
  integrationType: string
  state: ProviderConnectionState
  source: ProviderSource
  hasCredentials: boolean
  verifiedAt: string | null
  lastVerifiedAt: string | null
  lastError: string | null
  verificationData: Record<string, unknown> | null
  updatedAt: string | null
  credentialMeta: Array<{
    key: string
    present: boolean
    maskedValue: string | null
  }>
}

export type StripeProviderStatusSnapshot = {
  configured: boolean
  verified: boolean
  mode: 'test' | 'live' | null
  publishableKeyMasked: string | null
  secretKeyMasked: string | null
  webhookSecretMasked: string | null
  hasPublishableKey: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  webhookConfigured: boolean
  accountId: string | null
  chargesEnabled: boolean | null
  payoutsEnabled: boolean | null
  lastVerifiedAt: string | null
  lastError: string | null
  source: ProviderSource
  runtimeSource: ProviderSource
}

function normalizeStringValue(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeBooleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function normalizeStripeModeValue(value: unknown) {
  const normalized = normalizeStringValue(value)?.toLowerCase()
  return normalized === 'test' || normalized === 'live' ? normalized : null
}

function inferStripeModeFromSecret(secretKey: string | null) {
  if (!secretKey) return null
  if (secretKey.startsWith('sk_live_')) return 'live' as const
  if (secretKey.startsWith('sk_test_')) return 'test' as const
  return null
}

function findCredentialMetaEntry(status: ProviderStatus, key: string) {
  return status.credentialMeta.find((entry) => entry.key === key) || null
}

function credentialMetaPresent(status: ProviderStatus, key: string) {
  return Boolean(findCredentialMetaEntry(status, key)?.present)
}

function credentialMetaMaskedValue(status: ProviderStatus, key: string) {
  return findCredentialMetaEntry(status, key)?.maskedValue || null
}

export async function getStripeProviderStatusSnapshot(): Promise<StripeProviderStatusSnapshot> {
  const [status, runtime] = await Promise.all([
    getProviderStatus('STRIPE'),
    getRuntimeProviderConnectionInternal('STRIPE'),
  ])

  const runtimeCredentials = runtime.credentials || {}
  const hasPublishableKey = credentialMetaPresent(status, 'PUBLISHABLE_KEY')
  const hasSecretKey = credentialMetaPresent(status, 'SECRET_KEY')
  const hasWebhookSecret = credentialMetaPresent(status, 'WEBHOOK_SECRET')
  const configured = hasPublishableKey && hasSecretKey
  const verified = status.state === 'VERIFIED' && Boolean(status.lastVerifiedAt)
  const mode =
    normalizeStripeModeValue(credentialMetaMaskedValue(status, 'MODE')) ||
    normalizeStripeModeValue(runtimeCredentials.MODE) ||
    inferStripeModeFromSecret(normalizeStringValue(runtimeCredentials.SECRET_KEY))

  const verificationData = status.verificationData || {}
  const source: ProviderSource = configured ? 'db' : runtime.source

  return {
    configured,
    verified,
    mode,
    publishableKeyMasked: credentialMetaMaskedValue(status, 'PUBLISHABLE_KEY'),
    secretKeyMasked: credentialMetaMaskedValue(status, 'SECRET_KEY'),
    webhookSecretMasked: credentialMetaMaskedValue(status, 'WEBHOOK_SECRET'),
    hasPublishableKey,
    hasSecretKey,
    hasWebhookSecret,
    webhookConfigured: hasWebhookSecret,
    accountId: normalizeStringValue(verificationData.accountId),
    chargesEnabled: normalizeBooleanValue(verificationData.chargesEnabled),
    payoutsEnabled: normalizeBooleanValue(verificationData.payoutsEnabled),
    lastVerifiedAt: status.lastVerifiedAt,
    lastError: status.lastError,
    source,
    runtimeSource: runtime.source,
  }
}

export async function getProviderStatus(provider: SupportedProvider): Promise<ProviderStatus> {
  if (isShippingProvider(provider)) {
    const shippingStatus = await getShippingProviderConnectionStatus(provider)
    const integration = await findPreferredProviderIntegration(provider)
    const secretMap = integration ? buildSecretMap(integration.secrets) : new Map<string, string>()
    const verification = extractVerificationMeta(secretMap)
    const runtime = await getRuntimeProviderConnectionInternal(provider)

    return {
      provider,
      category: PROVIDER_CONFIG[provider].category,
      integrationType: PROVIDER_CONFIG[provider].integrationType,
      state: deriveConnectionState({
        hasIntegration: Boolean(integration),
        hasCredentials: shippingStatus.hasCredentials,
        lastVerifiedAt: verification.lastVerifiedAt,
        lastError: verification.lastError,
      }),
      source: runtime.source,
      hasCredentials: shippingStatus.hasCredentials,
      verifiedAt: verification.verifiedAt,
      lastVerifiedAt: verification.lastVerifiedAt,
      lastError: verification.lastError,
      verificationData: verification.verificationData,
      updatedAt: shippingStatus.updatedAt,
      credentialMeta: safeCredentialMetadata(provider, secretMap),
    }
  }

  const config = PROVIDER_CONFIG[provider]
  const integration = await findPreferredProviderIntegration(provider)

  if (!integration) {
    const runtime = await getRuntimeProviderConnectionInternal(provider)
    return {
      provider,
      category: config.category,
      integrationType: config.integrationType,
      state: runtime.source === 'env' ? 'CREDENTIALS_SAVED' : 'NOT_CONFIGURED',
      source: runtime.source,
      hasCredentials: runtime.source !== 'none',
      verifiedAt: null,
      lastVerifiedAt: null,
      lastError: null,
      verificationData: null,
      updatedAt: null,
      credentialMeta: [],
    }
  }

  const secretMap = buildSecretMap(integration.secrets)
  const hasCredentials = hasRequiredSecrets(provider, secretMap)
  const verification = extractVerificationMeta(secretMap)
  const runtime = await getRuntimeProviderConnectionInternal(provider)
  const effectiveSource: ProviderSource = hasCredentials ? 'db' : runtime.source

  return {
    provider,
    category: config.category,
    integrationType: config.integrationType,
    state: deriveConnectionState({
      hasIntegration: true,
      hasCredentials,
      lastVerifiedAt: verification.lastVerifiedAt,
      lastError: verification.lastError,
    }),
    source: effectiveSource,
    hasCredentials,
    verifiedAt: verification.verifiedAt,
    lastVerifiedAt: verification.lastVerifiedAt,
    lastError: verification.lastError,
    verificationData: verification.verificationData,
    updatedAt: integration.updatedAt.toISOString(),
    credentialMeta: safeCredentialMetadata(provider, secretMap),
  }
}

export async function listProviderStatuses() {
  const providers = Object.keys(PROVIDER_CONFIG) as SupportedProvider[]
  const statuses = await Promise.all(providers.map((provider) => getProviderStatus(provider)))

  return statuses.sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category)
    }

    return left.provider.localeCompare(right.provider)
  })
}

export async function saveProviderCredentials(provider: SupportedProvider, credentials: Record<string, unknown>) {
  const normalized = normalizeCredentialInput(provider, credentials)

  if (isShippingProvider(provider)) {
    await connectShippingProvider({
      provider,
      apiKey: normalized.API_KEY,
    })

    return getProviderStatus(provider)
  }

  if (provider === 'STRIPE') {
    const existing = await findPreferredProviderIntegration(provider)
    const existingSecretMap = existing ? buildSecretMap(existing.secrets) : new Map<string, string>()
    const existingCredentials = getDecryptedCredentials(provider, existingSecretMap)
    const existingModeValue =
      typeof existingCredentials.MODE === 'string' ? existingCredentials.MODE.trim().toLowerCase() : ''
    const existingMode =
      existingModeValue === 'test' || existingModeValue === 'live'
        ? existingModeValue
        : existingCredentials.SECRET_KEY?.startsWith('sk_live_')
          ? 'live'
          : existingCredentials.SECRET_KEY?.startsWith('sk_test_')
            ? 'test'
            : null

    const apiCredentialChanged =
      (typeof normalized.PUBLISHABLE_KEY === 'string' &&
        normalized.PUBLISHABLE_KEY !== existingCredentials.PUBLISHABLE_KEY) ||
      (typeof normalized.SECRET_KEY === 'string' && normalized.SECRET_KEY !== existingCredentials.SECRET_KEY) ||
      (typeof normalized.MODE === 'string' && normalizeStripeMode(normalized.MODE) !== existingMode)

    const mergedCredentials: Record<string, string> = {
      ...existingCredentials,
      ...normalized,
    }

    if (!hasRealCredential(mergedCredentials.PUBLISHABLE_KEY)) throw new Error('publishableKey is required')
    if (!hasRealCredential(mergedCredentials.SECRET_KEY)) throw new Error('secretKey is required')

    if (!hasRealCredential(mergedCredentials.MODE)) {
      const inferredMode = mergedCredentials.SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'
      mergedCredentials.MODE = normalizeStripeMode(inferredMode)
    }

    if (mergedCredentials.WEBHOOK_SECRET && !hasRealCredential(mergedCredentials.WEBHOOK_SECRET)) {
      delete mergedCredentials.WEBHOOK_SECRET
    }

    await upsertProviderIntegrationCredentials({
      provider,
      normalizedCredentials: mergedCredentials,
      clearVerificationMeta: apiCredentialChanged,
    })
  } else {
    await upsertProviderIntegrationCredentials({
      provider,
      normalizedCredentials: normalized,
    })
  }

  return getProviderStatus(provider)
}

async function verifyResendApi(apiKey: string) {
  const response = await fetch('https://api.resend.com/domains?limit=1', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(`Resend verification failed: ${responseText}`)
  }

  let domainCount: number | null = null
  try {
    const payload = JSON.parse(responseText)
    if (Array.isArray(payload?.data)) {
      domainCount = payload.data.length
    }
  } catch {
    domainCount = null
  }

  return {
    domainCount,
  }
}

async function verifyStripeApi(secretKey: string) {
  const response = await fetch('https://api.stripe.com/v1/account', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
    cache: 'no-store',
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(`Stripe verification failed: ${responseText}`)
  }

  let metadata: Record<string, unknown> = {}
  try {
    const payload = JSON.parse(responseText)
    metadata = {
      accountId: typeof payload?.id === 'string' ? payload.id : undefined,
      country: typeof payload?.country === 'string' ? payload.country : undefined,
      defaultCurrency: typeof payload?.default_currency === 'string' ? payload.default_currency : undefined,
      chargesEnabled: Boolean(payload?.charges_enabled),
      payoutsEnabled: Boolean(payload?.payouts_enabled),
    }
  } catch {
    metadata = {}
  }

  return metadata
}

async function verifySmtpConnection(credentials: Record<string, string>) {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: credentials.HOST,
    port: Number(credentials.PORT),
    secure: credentials.SECURE === 'true',
    auth: {
      user: credentials.USERNAME,
      pass: credentials.PASSWORD,
    },
  })

  await transporter.verify()

  return {
    host: credentials.HOST,
    port: Number(credentials.PORT),
    secure: credentials.SECURE === 'true',
  }
}

export async function verifyProviderConnection(provider: SupportedProvider) {
  const integration = await findPreferredProviderIntegration(provider)
  if (!integration) {
    throw new Error('Provider is not configured. Save credentials first.')
  }

  const secretMap = buildSecretMap(integration.secrets)
  const credentials = getDecryptedCredentials(provider, secretMap)

  if (!hasRequiredSecrets(provider, secretMap)) {
    throw new Error('Provider credentials are incomplete. Save credentials first.')
  }

  try {
    let verificationData: Record<string, unknown> | null = null

    if (isShippingProvider(provider)) {
      const result = await testShippingProviderConnection(provider)
      if (!result.result.ok) {
        throw new Error(result.result.message || 'Provider verification failed')
      }

      verificationData = {
        message: result.result.message,
        accountId: result.result.accountId,
        accountType: result.result.accountType,
      }
    } else if (provider === 'RESEND') {
      verificationData = await verifyResendApi(credentials.API_KEY)
    } else if (provider === 'SMTP') {
      verificationData = await verifySmtpConnection(credentials)
    } else {
      verificationData = await verifyStripeApi(credentials.SECRET_KEY)
    }

    await updateVerificationMeta({
      integrationId: integration.id,
      verified: true,
      verificationData,
    })

    return {
      status: await getProviderStatus(provider),
      verification: {
        ok: true,
        message: 'Provider verification succeeded.',
        metadata: verificationData,
      },
    }
  } catch (error) {
    await updateVerificationMeta({
      integrationId: integration.id,
      verified: false,
      errorMessage: sanitizeProviderError(error),
    })

    return {
      status: await getProviderStatus(provider),
      verification: {
        ok: false,
        message: sanitizeProviderError(error),
      },
    }
  }
}

export async function disconnectProvider(provider: SupportedProvider) {
  if (isShippingProvider(provider)) {
    await disconnectShippingProvider({
      provider,
      clearCredentials: true,
    })

    return getProviderStatus(provider)
  }

  const integration = await findPreferredProviderIntegration(provider)

  if (!integration) {
    return getProviderStatus(provider)
  }

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: {
        id: integration.id,
      },
      data: {
        status: 'INACTIVE',
      },
    })

    await tx.integrationSecret.deleteMany({
      where: {
        integrationId: integration.id,
      },
    })

    await tx.integration.updateMany({
      where: {
        type: PROVIDER_CONFIG[provider].integrationType,
        id: {
          not: integration.id,
        },
      },
      data: {
        status: 'INACTIVE',
      },
    })
  })

  return getProviderStatus(provider)
}

export async function sendProviderTestEmail(input: {
  provider: SupportedProvider
  toEmail: string
  fromEmail?: string | null
}) {
  const provider = input.provider
  const toEmail = trimToNull(input.toEmail)
  const requestedFromEmail = trimToNull(input.fromEmail ?? null)

  if (!toEmail) {
    throw new Error('A valid recipient email is required')
  }

  if (provider !== 'RESEND' && provider !== 'SMTP') {
    throw new Error('Test email is only supported for RESEND and SMTP right now')
  }

  const runtime = await getRuntimeProviderConnectionInternal(provider)
  if (!runtime.credentials || runtime.source === 'none') {
    throw new Error('Active runtime credentials are not available. Save and verify provider credentials first.')
  }

  if (provider === 'RESEND') {
    const apiKey = runtime.credentials.API_KEY
    if (!apiKey) {
      throw new Error('Resend API key is not available in the active runtime source')
    }

    const fromEmail = requestedFromEmail || runtime.credentials.FROM_EMAIL || 'Doopify <onboarding@resend.dev>'
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: 'Doopify provider test email',
        html: '<p>This is a Doopify provider test email.</p>',
      }),
      cache: 'no-store',
    })

    const responseText = await response.text()
    if (!response.ok) {
      throw new Error(`Resend test email failed: ${responseText}`)
    }

    let messageId: string | null = null
    try {
      const parsed = JSON.parse(responseText)
      messageId = typeof parsed?.id === 'string' ? parsed.id : null
    } catch {
      messageId = null
    }

    return {
      provider: 'RESEND' as const,
      source: runtime.source,
      toEmail,
      fromEmail,
      messageId,
    }
  }

  const nodemailer = await import('nodemailer')
  const host = runtime.credentials.HOST
  const port = Number(runtime.credentials.PORT)
  const username = runtime.credentials.USERNAME
  const password = runtime.credentials.PASSWORD
  const secure = String(runtime.credentials.SECURE || '').toLowerCase() === 'true'

  if (!host || !Number.isFinite(port) || !username || !password) {
    throw new Error('SMTP runtime credentials are incomplete. Save and verify SMTP credentials first.')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password,
    },
  })

  const fromEmail = requestedFromEmail || runtime.credentials.FROM_EMAIL || `Doopify <${username}>`
  const result = await transporter.sendMail({
    from: fromEmail,
    to: [toEmail],
    subject: 'Doopify provider test email',
    html: '<p>This is a Doopify provider test email.</p>',
    text: 'This is a Doopify provider test email.',
  })

  return {
    provider: 'SMTP' as const,
    source: runtime.source,
    toEmail,
    fromEmail,
    messageId: result.messageId || null,
  }
}

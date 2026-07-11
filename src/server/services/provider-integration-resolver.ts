import { prisma } from '@/lib/prisma'

export type BuiltInProviderKey = 'SHIPPO' | 'EASYPOST' | 'RESEND' | 'SMTP' | 'STRIPE'

const PROVIDER_INTEGRATION_TYPE: Record<BuiltInProviderKey, string> = {
  SHIPPO: 'SHIPPING_SHIPPO',
  EASYPOST: 'SHIPPING_EASYPOST',
  RESEND: 'EMAIL_RESEND',
  SMTP: 'EMAIL_SMTP',
  STRIPE: 'PAYMENT_STRIPE',
}

const REQUIRED_SECRET_KEYS: Record<BuiltInProviderKey, string[]> = {
  SHIPPO: ['API_KEY'],
  EASYPOST: ['API_KEY'],
  RESEND: ['API_KEY'],
  SMTP: ['HOST', 'PORT', 'USERNAME', 'PASSWORD'],
  STRIPE: ['PUBLISHABLE_KEY', 'SECRET_KEY'],
}

const VERIFIED_AT_SECRET_KEY = 'META_LAST_VERIFIED_AT'

export function providerIntegrationType(provider: BuiltInProviderKey) {
  return PROVIDER_INTEGRATION_TYPE[provider]
}

type CanonicalIntegration = {
  id: string
  providerKey: string | null
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: Date
  updatedAt: Date
  secrets: Array<{ id: string; key: string; value: string }>
}

function scoreIntegration(provider: BuiltInProviderKey, integration: CanonicalIntegration) {
  const keys = new Set(integration.secrets.map((secret) => secret.key))
  const requiredCount = REQUIRED_SECRET_KEYS[provider].filter((key) => keys.has(key)).length

  return {
    isExplicitCanonical: integration.providerKey === provider,
    isActive: integration.status === 'ACTIVE',
    hasAllRequiredSecretRows: requiredCount === REQUIRED_SECRET_KEYS[provider].length,
    hasVerificationMetadata: keys.has(VERIFIED_AT_SECRET_KEY),
    requiredCount,
  }
}

/**
 * Resolves exactly one built-in provider record. The explicit providerKey is
 * authoritative after the additive migration; the deterministic legacy sort
 * supports pre-migration rows without silently changing selection per caller.
 */
export function pickCanonicalProviderIntegration(
  provider: BuiltInProviderKey,
  integrations: CanonicalIntegration[]
) {
  if (!integrations.length) return null

  return [...integrations].sort((left, right) => {
    const leftScore = scoreIntegration(provider, left)
    const rightScore = scoreIntegration(provider, right)

    for (const key of ['isExplicitCanonical', 'isActive', 'hasAllRequiredSecretRows', 'hasVerificationMetadata'] as const) {
      if (leftScore[key] !== rightScore[key]) return leftScore[key] ? -1 : 1
    }

    if (leftScore.requiredCount !== rightScore.requiredCount) {
      return rightScore.requiredCount - leftScore.requiredCount
    }

    return (
      right.updatedAt.getTime() - left.updatedAt.getTime() ||
      right.createdAt.getTime() - left.createdAt.getTime() ||
      right.id.localeCompare(left.id)
    )
  })[0]
}

export async function resolveCanonicalProviderIntegration(provider: BuiltInProviderKey) {
  const integrations = (await prisma.integration.findMany({
    where: {
      type: providerIntegrationType(provider),
    },
    select: {
      id: true,
      providerKey: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      secrets: {
        select: {
          id: true,
          key: true,
          value: true,
        },
      },
    },
  })) as CanonicalIntegration[]

  return pickCanonicalProviderIntegration(provider, integrations)
}

export async function getProviderDuplicateAudit() {
  const providers = Object.keys(PROVIDER_INTEGRATION_TYPE) as BuiltInProviderKey[]
  const rows = await Promise.all(
    providers.map(async (provider) => {
      const canonical = await resolveCanonicalProviderIntegration(provider)
      const integrations = await prisma.integration.findMany({
        where: { type: providerIntegrationType(provider) },
        select: {
          id: true,
          providerKey: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { secrets: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      })

      return {
        provider,
        canonicalIntegrationId: canonical?.id ?? null,
        duplicateCount: Math.max(0, integrations.length - 1),
        integrations: integrations.map((integration) => ({
          id: integration.id,
          providerKey: integration.providerKey,
          status: integration.status,
          createdAt: integration.createdAt.toISOString(),
          updatedAt: integration.updatedAt.toISOString(),
          secretRowCount: integration._count.secrets,
        })),
      }
    })
  )

  return rows
}

import { err, ok } from '@/lib/api'
import { requireOwner } from '@/server/auth/require-auth'
import {
  listProviderStatuses,
  type ProviderStatus,
} from '@/server/services/provider-connection.service'

export const runtime = 'nodejs'

function credentialPresent(status: ProviderStatus, key: string) {
  return Boolean(status.credentialMeta?.find((entry) => entry.key === key)?.present)
}

function credentialMaskedValue(status: ProviderStatus, key: string) {
  return status.credentialMeta?.find((entry) => entry.key === key)?.maskedValue || null
}

function toStripeProviderSnapshot(status: ProviderStatus | null) {
  if (!status || status.provider !== 'STRIPE') return null

  const hasPublishableKey = credentialPresent(status, 'PUBLISHABLE_KEY')
  const hasSecretKey = credentialPresent(status, 'SECRET_KEY')
  const hasWebhookSecret = credentialPresent(status, 'WEBHOOK_SECRET')
  const modeValue = credentialMaskedValue(status, 'MODE')
  const mode = modeValue === 'test' || modeValue === 'live' ? modeValue : null
  const verificationData = status.verificationData || {}
  const accountId = typeof verificationData.accountId === 'string' ? verificationData.accountId : null
  const chargesEnabled =
    typeof verificationData.chargesEnabled === 'boolean' ? verificationData.chargesEnabled : null
  const payoutsEnabled =
    typeof verificationData.payoutsEnabled === 'boolean' ? verificationData.payoutsEnabled : null

  return {
    configured: hasPublishableKey && hasSecretKey,
    verified: status.state === 'VERIFIED',
    mode,
    publishableKeyMasked: credentialMaskedValue(status, 'PUBLISHABLE_KEY'),
    secretKeyMasked: credentialMaskedValue(status, 'SECRET_KEY'),
    webhookSecretMasked: credentialMaskedValue(status, 'WEBHOOK_SECRET'),
    hasPublishableKey,
    hasSecretKey,
    hasWebhookSecret,
    webhookConfigured: hasWebhookSecret,
    accountId,
    chargesEnabled,
    payoutsEnabled,
    lastVerifiedAt: status.lastVerifiedAt,
    lastError: status.lastError,
    source: status.source,
    runtimeSource: status.source,
  }
}

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const providers = await listProviderStatuses()
    const stripeProvider = providers.find((provider) => provider.provider === 'STRIPE') || null
    const stripeProviderStatus = toStripeProviderSnapshot(stripeProvider)
    return ok({ providers, stripeProviderStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load provider statuses'
    console.error('[GET /api/settings/providers]', message)
    return err('Failed to load provider statuses', 500)
  }
}

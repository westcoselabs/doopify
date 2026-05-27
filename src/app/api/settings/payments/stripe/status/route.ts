import { err, ok } from '@/lib/api'
import { resolveStripeWebhookEndpoint } from '@/lib/public-store-url'
import { requireOwner } from '@/server/auth/require-auth'
import { getStripeSavedStatusSnapshot } from '@/server/payments/stripe-runtime.service'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const status = await getStripeSavedStatusSnapshot()
    const requestOrigin = (() => {
      try {
        return new URL(req.url).origin
      } catch {
        return null
      }
    })()
    const webhookEndpoint = resolveStripeWebhookEndpoint({
      nextPublicStoreUrl: process.env.NEXT_PUBLIC_STORE_URL,
      currentOrigin: requestOrigin,
      nodeEnv: process.env.NODE_ENV,
    })

    return ok({
      configured: status.configured,
      checkoutKeysConfigured: status.checkoutKeysConfigured,
      source: status.source,
      mode: status.mode,
      hasPublishableKey: status.hasPublishableKey,
      hasSecretKey: status.hasSecretKey,
      hasWebhookSecret: status.hasWebhookSecret,
      publishableKeyMasked: status.publishableKeyMasked,
      secretKeyMasked: status.secretKeyMasked,
      webhookSecretMasked: status.webhookSecretMasked,
      webhookEndpointReady: webhookEndpoint.ready,
      webhookEndpoint: webhookEndpoint.endpointUrl,
      webhookEndpointSource: webhookEndpoint.endpointSource,
      webhookEndpointIssue: webhookEndpoint.issue,
      webhookEndpointMessage: webhookEndpoint.message,
      lastVerifiedAt: status.lastVerifiedAt,
      lastError: status.lastError,
      verificationStatus: status.verificationStatus,
    })
  } catch (error) {
    console.error('[GET /api/settings/payments/stripe/status]', error)
    return err('Failed to load Stripe status', 500)
  }
}

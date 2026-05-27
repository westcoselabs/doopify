import { err, ok } from '@/lib/api'
import { resolveStripeWebhookEndpoint } from '@/lib/public-store-url'
import {
  getStripeRuntimeStatusBundle,
  getStripeWebhookSecretSelection,
} from '@/server/payments/stripe-runtime.service'
import { requireOwner } from '@/server/auth/require-auth'

export const runtime = 'nodejs'
const PROVIDER_STATUS_TIMEOUT_MS = 350

function buildMessage(source: 'db' | 'env' | 'none') {
  if (source === 'db') return 'Checkout active source: DB verified connection.'
  if (source === 'env') return 'Checkout active source: .env fallback.'
  return 'Checkout is not configured. Add Stripe credentials in Settings -> Payments or env.'
}

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const {
      runtime: stripeRuntime,
      providerStatus: stripeProviderStatus,
      providerStatusUnavailable,
    } = await getStripeRuntimeStatusBundle({
      providerStatusTimeoutMs: PROVIDER_STATUS_TIMEOUT_MS,
    })
    const webhookSecretSelection = await getStripeWebhookSecretSelection(stripeRuntime)
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
      source: stripeRuntime.source,
      mode: stripeRuntime.mode,
      hasPublishableKey: Boolean(stripeRuntime.publishableKey),
      hasSecretKey: Boolean(stripeRuntime.secretKey),
      hasWebhookSecret: Boolean(webhookSecretSelection.webhookSecret),
      webhookSource: webhookSecretSelection.source,
      verified: stripeRuntime.verified,
      accountId: stripeRuntime.accountId,
      chargesEnabled: stripeRuntime.chargesEnabled,
      payoutsEnabled: stripeRuntime.payoutsEnabled,
      webhookEndpoint: webhookEndpoint.endpointUrl,
      webhookEndpointSource: webhookEndpoint.endpointSource,
      webhookEndpointReady: webhookEndpoint.ready,
      webhookEndpointIssue: webhookEndpoint.issue,
      webhookEndpointMessage: webhookEndpoint.message,
      providerStatus: stripeProviderStatus,
      providerStatusUnavailable,
      message: buildMessage(stripeRuntime.source),
    })
  } catch (error) {
    console.error('[GET /api/settings/payments/stripe/runtime-status]', error)
    return err('Failed to load Stripe runtime status', 500)
  }
}

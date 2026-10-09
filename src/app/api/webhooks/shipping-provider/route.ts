import { processInboundWebhook } from '@/server/services/inbound-webhook-processing.service'
import {
  recordVerifiedWebhookDelivery,
  recordRejectedWebhook,
  hashWebhookPayload,
} from '@/server/services/webhook-delivery.service'
import {
  parseShippingProviderWebhookPayload,
  verifyShippingProviderWebhookSignature,
} from '@/server/shipping/shipping-tracking-webhook.service'

export const runtime = 'nodejs'

function resolveProvider(url: URL) {
  const raw = String(url.searchParams.get('provider') ?? '')
    .trim()
    .toUpperCase()

  if (raw === 'EASYPOST') return 'EASYPOST' as const
  if (raw === 'SHIPPO') return 'SHIPPO' as const
  return null
}

function providerWebhookName(provider: 'EASYPOST' | 'SHIPPO') {
  return provider === 'EASYPOST' ? 'shipping.easypost' : 'shipping.shippo'
}

export async function POST(req: Request) {
  const provider = resolveProvider(new URL(req.url))
  if (!provider) return new Response('Shipping provider query is required (provider=EASYPOST|SHIPPO)', { status: 400 })
  const payload = await req.text()
  try { verifyShippingProviderWebhookSignature({ provider, payload, headers: req.headers }) }
  catch {
    await recordRejectedWebhook({ provider: providerWebhookName(provider), payload, error: 'Shipping webhook signature verification failed' })
    return new Response('Webhook signature verification failed', { status: 400 })
  }
  const event = parseShippingProviderWebhookPayload({ provider, payload })
  if (!event) return new Response('Invalid shipping webhook payload', { status: 400 })
  const delivery = await recordVerifiedWebhookDelivery({ provider: providerWebhookName(provider), providerEventId: event.providerEventId || 'payload:' + hashWebhookPayload(payload), eventType: event.eventType, payload })
  if (delivery.status === 'PROCESSED') return new Response('OK')
  const result = await processInboundWebhook(delivery.id)
  return new Response(result?.status === 'PROCESSED' ? 'OK' : 'Delivery pending or failed', { status: !result ? 202 : result.status === 'PROCESSED' ? 200 : 500 })
}

import { env } from '@/lib/env'
import { verifyStripeWebhookSignature } from '@/lib/stripe'
import { withRouteTiming } from '@/server/observability/timing'
import { recordVerifiedWebhookDelivery, recordRejectedWebhook } from '@/server/services/webhook-delivery.service'
import { parseStripeWebhookEventPayload } from '@/server/services/stripe-webhook.service'
import { processInboundWebhook } from '@/server/services/inbound-webhook-processing.service'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return withRouteTiming('POST /api/webhooks/stripe', req, async ({ step }) => {
    if (!env.STRIPE_WEBHOOK_SECRET) return new Response('STRIPE_WEBHOOK_SECRET is not configured', { status: 503 })
    const payload = await req.text()
    try {
      verifyStripeWebhookSignature(payload, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET)
    } catch {
      await recordRejectedWebhook({ provider: 'stripe', payload, error: 'Stripe webhook signature verification failed' })
      return new Response('Webhook signature verification failed', { status: 400 })
    }
    step('verify_signature')
    const event = parseStripeWebhookEventPayload(payload)
    if (!event) return new Response('Invalid Stripe webhook payload', { status: 400 })
    const delivery = await recordVerifiedWebhookDelivery({ provider: 'stripe', providerEventId: event.id, eventType: event.type, payload })
    if (delivery.status === 'PROCESSED') return new Response('OK')
    const result = await processInboundWebhook(delivery.id)
    step('process_event')
    if (!result) return new Response('Delivery already claimed or awaiting retry', { status: 202 })
    return new Response(result.status === 'PROCESSED' ? 'OK' : 'Webhook processing failed', { status: result.status === 'PROCESSED' ? 200 : 500 })
  })
}

import { claimWebhookDelivery, markWebhookDeliveryFailed, markWebhookDeliveryProcessed } from '@/server/services/webhook-delivery.service'
import { parseStripeWebhookEventPayload, processStripeWebhookEvent } from '@/server/services/stripe-webhook.service'
import { applyEmailProviderWebhookEvent, parseEmailProviderWebhookPayload } from '@/server/services/email-delivery.service'
import { applyShippingProviderTrackingWebhookEvent, parseShippingProviderWebhookPayload } from '@/server/shipping/shipping-tracking-webhook.service'

class InvalidStoredWebhookError extends Error {}

/** Ingress, automatic retry and operator replay share the same claim fence. */
export async function processInboundWebhook(id: string, manualReplay = false) {
  const delivery = await claimWebhookDelivery(id, manualReplay)
  if (!delivery?.claimToken) return null
  const claim = { provider: delivery.provider, providerEventId: delivery.providerEventId, claimToken: delivery.claimToken }
  try {
    const payload = delivery.rawPayload!
    if (delivery.provider === 'stripe') {
      const event = parseStripeWebhookEventPayload(payload)
      if (!event || event.id !== delivery.providerEventId) throw new InvalidStoredWebhookError('Stored Stripe event is invalid')
      await processStripeWebhookEvent(event)
    } else if (delivery.provider === 'resend') {
      const event = parseEmailProviderWebhookPayload(payload)
      if (!event) throw new InvalidStoredWebhookError('Stored email event is invalid')
      const result = await applyEmailProviderWebhookEvent(event)
      if (!result.handled && result.reason !== 'UNSUPPORTED_EVENT') throw new Error(result.reason)
    } else if (delivery.provider === 'shipping.shippo' || delivery.provider === 'shipping.easypost') {
      const provider = delivery.provider === 'shipping.shippo' ? 'SHIPPO' : 'EASYPOST'
      const event = parseShippingProviderWebhookPayload({ provider, payload })
      if (!event) throw new InvalidStoredWebhookError('Stored shipping event is invalid')
      const result = await applyShippingProviderTrackingWebhookEvent(event)
      if (!result.handled && result.reason !== 'UNSUPPORTED_EVENT') throw new Error(result.reason)
    } else throw new InvalidStoredWebhookError('Unsupported inbound provider')
    const result = await markWebhookDeliveryProcessed(claim)
    return result ? { id, status: result.status, attempts: result.attempts } : null
  } catch (error) {
    const result = await markWebhookDeliveryFailed({ ...claim, error: error instanceof Error ? error.message : 'Webhook processing failed', retryable: !(error instanceof InvalidStoredWebhookError) })
    return result ? { id, status: result.status, attempts: result.attempts } : null
  }
}

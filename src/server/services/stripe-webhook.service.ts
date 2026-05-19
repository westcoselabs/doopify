import { type StripePaymentIntent, type StripeWebhookEvent } from '@/lib/stripe'
import { markCheckoutSessionFailed } from '@/server/services/checkout.service'
import { runFinalizePaidOrderWorkflow } from '@/workflows/checkout/finalize-paid-order.workflow'

export function parseStripeWebhookEventPayload(payload: string): StripeWebhookEvent<StripePaymentIntent> | null {
  try {
    const event = JSON.parse(payload)
    if (!event || typeof event !== 'object') return null
    if (typeof event.id !== 'string' || typeof event.type !== 'string') return null
    if (!event.data || typeof event.data !== 'object' || !('object' in event.data)) return null
    return event as StripeWebhookEvent<StripePaymentIntent>
  } catch {
    return null
  }
}

export async function processStripeWebhookEvent(event: StripeWebhookEvent<StripePaymentIntent>) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await runFinalizePaidOrderWorkflow({
        paymentIntent: event.data.object,
      })
      return
    case 'payment_intent.payment_failed':
      await markCheckoutSessionFailed({
        paymentIntentId: event.data.object.id,
        reason: event.data.object.last_payment_error?.message ?? 'Payment failed',
      })
      return
    default:
      return
  }
}

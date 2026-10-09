import type { AnyInternalEventHandler, DoopifyEvents, InternalEventHandler } from '@/server/events/types'
import { queueShippingTrackingSyncJob } from '@/server/shipping/shipping-tracking-jobs.service'
import type { AnalyticsEventName } from '@/server/services/analytics-event.service'
import { recordAnalyticsEvent } from '@/server/services/analytics-event.service'
import { queueFulfillmentTrackingEmailDelivery } from '@/server/services/email-delivery.service'
import { sendOrderConfirmationEmail } from '@/server/services/email.service'

function logEvent(name: string, payload: unknown) {
  console.info(`[event:${name}]`, payload)
}

function defineHandler<K extends keyof DoopifyEvents>(handler: InternalEventHandler<K>) {
  return handler
}

function defineAnalyticsHandler<K extends AnalyticsEventName>(event: K): InternalEventHandler<K> {
  return defineHandler({
    event,
    handle: async (payload: DoopifyEvents[K], context) => {
      await recordAnalyticsEvent(event, payload, context?.client)
    },
  })
}

export const integrationRegistry = [
  defineHandler({
    event: 'order.created',
    handle: async (payload: DoopifyEvents['order.created']) => {
      logEvent('order.created', payload)
    },
  }),
  defineHandler({
    event: 'order.paid',
    handle: async (payload: DoopifyEvents['order.paid'], context) => {
      logEvent('order.paid', payload)
      if (!payload.email) {
        return
      }

      await sendOrderConfirmationEmail({
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        email: payload.email,
        currency: payload.currency,
        total: payload.total,
        items: payload.items,
        shippingAddress: payload.shippingAddress ?? null,
      }, context?.client)
    },
  }),
  defineHandler({
    event: 'product.created',
    handle: async (payload: DoopifyEvents['product.created']) => {
      logEvent('product.created', payload)
    },
  }),
  defineHandler({
    event: 'product.updated',
    handle: async (payload: DoopifyEvents['product.updated']) => {
      logEvent('product.updated', payload)
    },
  }),
  defineHandler({
    event: 'fulfillment.created',
    handle: async (payload: DoopifyEvents['fulfillment.created'], context) => {
      logEvent('fulfillment.created', payload)
      await queueShippingTrackingSyncJob({ fulfillmentId: payload.fulfillmentId, orderId: payload.orderId }, context?.client)
      if (payload.sendTrackingEmail) await queueFulfillmentTrackingEmailDelivery({ fulfillmentId: payload.fulfillmentId, orderId: payload.orderId }, context?.client)
    },
  }),
  defineHandler({
    event: 'checkout.failed',
    handle: async (payload: DoopifyEvents['checkout.failed']) => {
      logEvent('checkout.failed', payload)
    },
  }),
  defineHandler({
    event: 'checkout.abandoned',
    handle: async (payload: DoopifyEvents['checkout.abandoned']) => {
      logEvent('checkout.abandoned', payload)
    },
  }),
  defineHandler({
    event: 'checkout.recovery_email_sent',
    handle: async (payload: DoopifyEvents['checkout.recovery_email_sent']) => {
      logEvent('checkout.recovery_email_sent', payload)
    },
  }),
  defineHandler({
    event: 'checkout.recovered',
    handle: async (payload: DoopifyEvents['checkout.recovered']) => {
      logEvent('checkout.recovered', payload)
    },
  }),
  defineAnalyticsHandler('checkout.created'),
  defineAnalyticsHandler('checkout.failed'),
  defineAnalyticsHandler('checkout.abandoned'),
  defineAnalyticsHandler('checkout.recovery_email_sent'),
  defineAnalyticsHandler('checkout.recovered'),
  defineAnalyticsHandler('order.created'),
  defineAnalyticsHandler('order.paid'),
  defineAnalyticsHandler('refund.issued'),
  defineAnalyticsHandler('return.requested'),
  defineAnalyticsHandler('return.closed'),
  defineAnalyticsHandler('email.sent'),
  defineAnalyticsHandler('email.failed'),
  defineAnalyticsHandler('webhook.delivered'),
  defineAnalyticsHandler('webhook.failed'),
] satisfies AnyInternalEventHandler[]

import { integrationRegistry } from '@/server/integrations/registry'
import { queueOutboundWebhooks } from '@/server/services/outbound-webhook.service'

import type { DoopifyEventName, DoopifyEvents, InternalEventHandler } from '@/server/events/types'
import type { EventPersistenceContext } from './types'

/** All consumers must be persistence-only and must propagate errors for rollback. */
export async function dispatchPersistedEvent<K extends DoopifyEventName>(event: K, payload: DoopifyEvents[K], context: EventPersistenceContext) {
  const handlers = integrationRegistry.filter(handler => handler.event === event) as unknown as InternalEventHandler<K>[]
  if (!handlers.length && !OUTBOUND_WEBHOOK_EVENTS.has(event)) throw new Error('Unregistered persisted event')
  for (const handler of handlers) await handler.handle(payload, context)
  if (OUTBOUND_WEBHOOK_EVENTS.has(event)) await queueOutboundWebhooks(event, payload, context.client)
}

const OUTBOUND_WEBHOOK_EVENTS = new Set<DoopifyEventName>([
  'order.created',
  'order.paid',
  'product.created',
  'product.updated',
  'fulfillment.created',
  'checkout.failed',
  'checkout.abandoned',
  'checkout.recovery_email_sent',
  'checkout.recovered',
  'order.refunded',
  'order.return_requested',
  'order.return_updated',
])

export async function emitInternalEvent<K extends DoopifyEventName>(
  event: K,
  payload: DoopifyEvents[K]
) {
  const handlers = integrationRegistry.filter(
    (handler) => handler.event === event
  ) as unknown as InternalEventHandler<K>[]

  await Promise.allSettled(
    handlers.map(async (handler) => {
      try {
        await handler.handle(payload)
      } catch (error) {
        console.error(`[emitInternalEvent] handler failed for ${event}`, error)
      }
    })
  )

  if (!OUTBOUND_WEBHOOK_EVENTS.has(event)) {
    return
  }

  try {
    await queueOutboundWebhooks(event, payload)
  } catch (error) {
    console.error(`[emitInternalEvent] Failed to queue outbound webhooks for ${event}`, error)
  }
}

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { DoopifyEventName, DoopifyEvents } from '@/server/events/types'

export const ANALYTICS_EVENT_NAMES = [
  'checkout.created',
  'checkout.failed',
  'checkout.abandoned',
  'checkout.recovery_email_sent',
  'checkout.recovered',
  'order.created',
  'order.paid',
  'refund.issued',
  'return.requested',
  'return.closed',
  'email.sent',
  'email.failed',
  'webhook.delivered',
  'webhook.failed',
] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number]

function extractAnalyticsReferences<K extends AnalyticsEventName>(
  event: K,
  payload: DoopifyEvents[K]
): {
  orderId?: string
  refundId?: string
  returnId?: string
  deliveryId?: string
} {
  const context = { event, payload } as {
    [Name in AnalyticsEventName]: {
      event: Name
      payload: DoopifyEvents[Name]
    }
  }[AnalyticsEventName]

  switch (context.event) {
    case 'checkout.created':
    case 'checkout.failed':
    case 'checkout.abandoned':
    case 'checkout.recovery_email_sent':
    case 'checkout.recovered':
      return {}
    case 'order.created':
    case 'order.paid':
      return { orderId: context.payload.orderId }
    case 'refund.issued':
      return {
        orderId: context.payload.orderId,
        refundId: context.payload.refundId,
      }
    case 'return.requested':
    case 'return.closed':
      return {
        orderId: context.payload.orderId,
        returnId: context.payload.returnId,
      }
    case 'email.sent':
    case 'email.failed':
      return {
        orderId: context.payload.orderId ?? undefined,
        refundId: context.payload.refundId ?? undefined,
        returnId: context.payload.returnId ?? undefined,
        deliveryId: context.payload.deliveryId,
      }
    case 'webhook.delivered':
    case 'webhook.failed':
      return {
        deliveryId: context.payload.deliveryId,
      }
    default:
      return {}
  }
}

export async function recordAnalyticsEvent<K extends AnalyticsEventName>(
  event: K,
  payload: DoopifyEvents[K],
  client: Pick<Prisma.TransactionClient, 'analyticsEvent'> = prisma
) {
  const refs = extractAnalyticsReferences(event, payload)

  return client.analyticsEvent.create({
    data: {
      event,
      payload: payload as Prisma.InputJsonValue,
      orderId: refs.orderId,
      refundId: refs.refundId,
      returnId: refs.returnId,
      deliveryId: refs.deliveryId,
    },
  })
}

export function isAnalyticsEventName(event: DoopifyEventName): event is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(event)
}

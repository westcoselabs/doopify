import { z } from 'zod'

import { processShippingTrackingSyncJob } from '@/server/shipping/shipping-tracking-jobs.service'
import {
  processFulfillmentTrackingEmailDeliveryJob,
  processOrderConfirmationEmailDeliveryJob,
} from '@/server/services/email-delivery.service'
import { ANALYTICS_EVENT_NAMES, recordAnalyticsEvent } from '@/server/services/analytics-event.service'
import { processOutboundWebhook } from '@/server/services/outbound-webhook.service'

export const JOB_TYPES = [
  'SEND_ORDER_CONFIRMATION_EMAIL',
  'SEND_FULFILLMENT_EMAIL',
  'SYNC_SHIPPING_TRACKING',
  'SEND_OUTBOUND_WEBHOOK',
  'RECORD_ANALYTICS_EVENT',
] as const

export type JobType = (typeof JOB_TYPES)[number]

export type JobHandlerContext = {
  jobId: string
  claimToken: string
}

export type JobHandler = (payload: unknown, context: JobHandlerContext) => Promise<void>

const sendOrderConfirmationEmailPayloadSchema = z.object({
  deliveryId: z.string().min(1),
})

const sendOutboundWebhookPayloadSchema = z.object({
  deliveryId: z.string().min(1),
})

const sendFulfillmentEmailPayloadSchema = z.object({
  deliveryId: z.string().min(1),
  fulfillmentId: z.string().min(1),
  orderId: z.string().min(1).optional(),
})

const syncShippingTrackingPayloadSchema = z.object({
  fulfillmentId: z.string().min(1),
  orderId: z.string().min(1).optional(),
})

const recordAnalyticsEventPayloadSchema = z.object({
  event: z.enum(ANALYTICS_EVENT_NAMES),
  payload: z.unknown(),
})

const handlers: Record<JobType, JobHandler> = {
  SEND_ORDER_CONFIRMATION_EMAIL: async (payload, context) => {
    const parsed = sendOrderConfirmationEmailPayloadSchema.parse(payload)
    await processOrderConfirmationEmailDeliveryJob(parsed, context)
  },
  SEND_FULFILLMENT_EMAIL: async (payload, context) => {
    const parsed = sendFulfillmentEmailPayloadSchema.parse(payload)
    await processFulfillmentTrackingEmailDeliveryJob(parsed, context)
  },
  SYNC_SHIPPING_TRACKING: async (payload, context) => {
    const parsed = syncShippingTrackingPayloadSchema.parse(payload)
    await processShippingTrackingSyncJob({
      ...parsed,
      jobId: context.jobId,
    })
  },
  SEND_OUTBOUND_WEBHOOK: async (payload) => {
    const parsed = sendOutboundWebhookPayloadSchema.parse(payload)
    const result = await processOutboundWebhook(parsed.deliveryId)
    if (!result) {
      throw new Error(`Outbound webhook delivery ${parsed.deliveryId} is not runnable`)
    }
  },
  RECORD_ANALYTICS_EVENT: async (payload) => {
    const parsed = recordAnalyticsEventPayloadSchema.parse(payload)
    await recordAnalyticsEvent(parsed.event, parsed.payload as never)
  },
}

export function getJobHandler(type: string): JobHandler | null {
  if (!Object.hasOwn(handlers, type)) {
    return null
  }

  return handlers[type as JobType]
}

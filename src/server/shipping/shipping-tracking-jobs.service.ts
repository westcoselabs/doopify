import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { enqueueJob } from '@/server/jobs/job.service'
import { getShippingProviderTrackingStatus } from '@/server/shipping/shipping-provider.service'

const TRACKING_POLL_INTERVAL_MS = 15 * 60 * 1000
const ACTIVE_TRACKING_POLL_JOB_STATUSES = ['PENDING', 'RUNNING', 'RETRYING'] as const

type TrackingLifecycleStatus = 'PRE_TRANSIT' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILURE' | 'UNKNOWN'

function isSupportedProvider(value: string | null | undefined): value is 'EASYPOST' | 'SHIPPO' {
  return value === 'EASYPOST' || value === 'SHIPPO'
}

function parseDeliveredAt(value: string | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function hasTrackingPollLifecycle(status: TrackingLifecycleStatus) {
  return status === 'PRE_TRANSIT' || status === 'IN_TRANSIT' || status === 'UNKNOWN'
}

async function queueFollowUpTrackingPoll(input: {
  fulfillmentId: string
  orderId: string
  skipJobId?: string
}) {
  const existing = await prisma.job.findFirst({
    where: {
      type: 'SYNC_SHIPPING_TRACKING',
      status: {
        in: [...ACTIVE_TRACKING_POLL_JOB_STATUSES],
      },
      ...(input.skipJobId ? { id: { not: input.skipJobId } } : {}),
      payload: {
        path: ['fulfillmentId'],
        equals: input.fulfillmentId,
      },
    },
    select: { id: true },
  })

  if (existing) {
    return null
  }

  return enqueueJob(
    'SYNC_SHIPPING_TRACKING',
    {
      fulfillmentId: input.fulfillmentId,
      orderId: input.orderId,
    },
    {
      runAt: new Date(Date.now() + TRACKING_POLL_INTERVAL_MS),
      maxAttempts: 5,
    }
  )
}

export async function queueShippingTrackingSyncJob(input: {
  fulfillmentId: string
  orderId: string
}, client?: Prisma.TransactionClient) {
  return enqueueJob(
    'SYNC_SHIPPING_TRACKING',
    {
      fulfillmentId: input.fulfillmentId,
      orderId: input.orderId,
    },
    {
      runAt: new Date(),
      maxAttempts: 5,
    },
    client
  )
}

export async function processShippingTrackingSyncJob(input: {
  fulfillmentId: string
  orderId?: string
  jobId?: string
}) {
  const fulfillment = await prisma.fulfillment.findUnique({
    where: { id: input.fulfillmentId },
    include: {
      shippingLabels: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!fulfillment) {
    return { synced: false as const, reason: 'NOT_FOUND' as const }
  }

  const latestLabel = fulfillment.shippingLabels[0] ?? null
  let trackingNumber = fulfillment.trackingNumber ?? latestLabel?.trackingNumber ?? null
  let trackingUrl = fulfillment.trackingUrl ?? latestLabel?.trackingUrl ?? null
  let lifecycleStatus: TrackingLifecycleStatus = 'UNKNOWN'
  let providerStatus: string | null = null
  let deliveredAtFromProvider: Date | null = null
  let providerTrackingChecked = false

  if (latestLabel?.provider && isSupportedProvider(latestLabel.provider)) {
    try {
      const tracking = await getShippingProviderTrackingStatus({
        provider: latestLabel.provider,
        request: {
          providerShipmentId: latestLabel.providerShipmentId ?? undefined,
          providerLabelId: latestLabel.providerLabelId ?? undefined,
          trackingNumber: latestLabel.trackingNumber ?? fulfillment.trackingNumber ?? undefined,
          carrier: latestLabel.carrier ?? fulfillment.carrier ?? undefined,
        },
      })

      providerTrackingChecked = true
      lifecycleStatus = tracking.lifecycleStatus
      providerStatus = tracking.providerStatus
      trackingNumber = tracking.trackingNumber ?? trackingNumber
      trackingUrl = tracking.trackingUrl ?? trackingUrl
      deliveredAtFromProvider = parseDeliveredAt(tracking.deliveredAt)
    } catch (error) {
      console.warn('[processShippingTrackingSyncJob] provider tracking check failed', {
        fulfillmentId: fulfillment.id,
        provider: latestLabel.provider,
        error: error instanceof Error ? error.message : 'Unknown tracking lookup error',
      })
    }
  }

  const needsTrackingBackfill =
    (!fulfillment.trackingNumber && Boolean(trackingNumber)) ||
    (!fulfillment.trackingUrl && Boolean(trackingUrl))
  const shouldPromoteOpen = fulfillment.status === 'PENDING' && Boolean(trackingNumber || trackingUrl)
  const shouldMarkDelivered =
    !fulfillment.deliveredAt &&
    (lifecycleStatus === 'DELIVERED' || Boolean(deliveredAtFromProvider))
  const deliveredAt = deliveredAtFromProvider ?? new Date()
  const hasLifecycleTrackingState = providerTrackingChecked && hasTrackingPollLifecycle(lifecycleStatus)

  if (!needsTrackingBackfill && !shouldPromoteOpen && !shouldMarkDelivered) {
    if (hasLifecycleTrackingState && trackingNumber) {
      await queueFollowUpTrackingPoll({
        fulfillmentId: fulfillment.id,
        orderId: fulfillment.orderId,
        skipJobId: input.jobId,
      })
      return { synced: false as const, reason: 'POLL_SCHEDULED' as const }
    }

    return { synced: false as const, reason: 'NO_CHANGES' as const }
  }

  await prisma.$transaction(async (tx) => {
    await tx.fulfillment.update({
      where: { id: fulfillment.id },
      data: {
        status: shouldMarkDelivered ? 'SUCCESS' : shouldPromoteOpen ? 'OPEN' : undefined,
        trackingNumber: trackingNumber ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        deliveredAt: shouldMarkDelivered ? deliveredAt : undefined,
      },
    })

    if (latestLabel) {
      await tx.shippingLabel.update({
        where: { id: latestLabel.id },
        data: {
          status: providerStatus ?? undefined,
          trackingNumber: trackingNumber ?? undefined,
          trackingUrl: trackingUrl ?? undefined,
        },
      })
    }

    await tx.orderEvent.create({
      data: {
        orderId: fulfillment.orderId,
        type: shouldMarkDelivered ? 'SHIPPING_DELIVERED' : 'SHIPPING_TRACKING_SYNCED',
        title: shouldMarkDelivered
          ? trackingNumber
            ? `Shipment delivered: ${trackingNumber}`
            : 'Shipment delivered'
          : trackingNumber
            ? `Tracking synced: ${trackingNumber}`
            : 'Shipping tracking synced',
        detail: latestLabel
          ? shouldMarkDelivered
            ? `Delivery confirmed by ${latestLabel.provider}${providerStatus ? ` (${providerStatus})` : ''}`
            : `Tracking synced from ${latestLabel.provider} label (${latestLabel.id})`
          : 'Tracking synced from fulfillment state',
        actorType: 'SYSTEM',
      },
    })
  })

  if (hasLifecycleTrackingState && !shouldMarkDelivered && trackingNumber) {
    await queueFollowUpTrackingPoll({
      fulfillmentId: fulfillment.id,
      orderId: fulfillment.orderId,
      skipJobId: input.jobId,
    })
  }

  return { synced: true as const }
}

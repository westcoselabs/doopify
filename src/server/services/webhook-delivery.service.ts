import crypto from 'node:crypto'

import { Prisma } from '@prisma/client'
import type { WebhookDeliveryStatus } from '@prisma/client'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { emitInternalEvent } from '@/server/events/dispatcher'
import { DELIVERY_LEASE_MS } from '@/server/jobs/delivery-runtime'

export const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 4

const RETRY_BACKOFF_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
] as const

const webhookDeliveryListSelect = {
  id: true,
  provider: true,
  providerEventId: true,
  eventType: true,
  status: true,
  attempts: true,
  processedAt: true,
  lastError: true,
  payloadHash: true,
  rawPayload: true,
  nextRetryAt: true,
  lastRetriedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WebhookDeliverySelect

function getRetryDelayMs(attempts: number) {
  return RETRY_BACKOFF_MS[Math.max(0, Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1))]
}

function getRetrySchedule(attempts: number, retryable: boolean, now = new Date()) {
  if (!retryable) {
    return {
      status: 'FAILED' as WebhookDeliveryStatus,
      nextRetryAt: null,
    }
  }

  if (attempts >= MAX_WEBHOOK_DELIVERY_ATTEMPTS) {
    return {
      status: 'RETRY_EXHAUSTED' as WebhookDeliveryStatus,
      nextRetryAt: null,
    }
  }

  return {
    status: 'RETRY_PENDING' as WebhookDeliveryStatus,
    nextRetryAt: new Date(now.getTime() + getRetryDelayMs(attempts)),
  }
}

function getReplayBlockers(delivery: Awaited<ReturnType<typeof getWebhookDeliveryById>>) {
  if (!delivery) return ['Webhook delivery not found']

  const blockers: string[] = []
  if (delivery.provider !== 'stripe') blockers.push('Replay is only supported for Stripe deliveries')
  if (delivery.providerEventId.startsWith('unknown:')) blockers.push('Replay requires a provider event id')
  if (!delivery.rawPayload) blockers.push('Replay requires a verified stored payload')
  if (delivery.status === 'SIGNATURE_FAILED') blockers.push('Signature failures are not replayable')
  if (delivery.claimToken && delivery.leaseExpiresAt && delivery.leaseExpiresAt > new Date()) blockers.push('Delivery is already being processed')

  return blockers
}

function getRetryBlockers(delivery: Awaited<ReturnType<typeof getWebhookDeliveryById>>) {
  const blockers: string[] = []
  if (!delivery) return ['Webhook delivery not found']
  if (!delivery.rawPayload || delivery.status === 'SIGNATURE_FAILED') blockers.push('Retry requires a verified stored payload')
  if (!['stripe', 'resend', 'shipping.shippo', 'shipping.easypost'].includes(delivery.provider)) blockers.push('Unsupported retry provider')
  if (delivery.claimToken && delivery.leaseExpiresAt && delivery.leaseExpiresAt > new Date()) blockers.push('Delivery is already being processed')
  if (delivery.status === 'PROCESSED') blockers.push('Processed deliveries do not need retry')
  if (delivery.status === 'RETRY_EXHAUSTED') blockers.push('Retry attempts are exhausted')
  if (delivery.attempts >= MAX_WEBHOOK_DELIVERY_ATTEMPTS) blockers.push('Maximum attempts reached')

  return Array.from(new Set(blockers))
}

export async function getWebhookDeliveries(params: {
  provider?: string
  status?: WebhookDeliveryStatus
  eventType?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const {
    provider,
    status,
    eventType,
    search,
    page = 1,
    pageSize = 20,
  } = params
  const trimmedSearch = search?.trim()

  const where: Prisma.WebhookDeliveryWhereInput = {
    ...(provider ? { provider } : {}),
    ...(status ? { status } : {}),
    ...(eventType ? { eventType } : {}),
    ...(trimmedSearch
      ? {
          OR: [
            { providerEventId: { contains: trimmedSearch, mode: 'insensitive' } },
            { lastError: { contains: trimmedSearch, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      select: webhookDeliveryListSelect,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.webhookDelivery.count({ where }),
  ])

  return {
    deliveries: deliveries.map((delivery) => {
      const { rawPayload, ...safeDelivery } = delivery
      return {
        ...safeDelivery,
        hasVerifiedPayload: Boolean(rawPayload),
      }
    }),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getWebhookDeliveryById(id: string) {
  return prisma.webhookDelivery.findUnique({
    where: { id },
  })
}

export function hashWebhookPayload(payload: string) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
}

/** Only call after provider signature verification. Repeated receipts cannot
 * mutate an existing verified payload, outcome, retry schedule, or ownership. */
export async function recordVerifiedWebhookDelivery(input: {
  provider: string; providerEventId: string; eventType: string; payload: string
}) {
  return prisma.webhookDelivery.upsert({
    where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
    create: { provider: input.provider, providerEventId: input.providerEventId, eventType: input.eventType, payloadHash: hashWebhookPayload(input.payload), rawPayload: input.payload, status: 'RECEIVED', attempts: 0 },
    update: {},
  })
}

export async function recordRejectedWebhook(input: { provider: string; payload: string; error: string }) {
  const payloadHash = hashWebhookPayload(input.payload)
  // Untrusted event IDs can never address the canonical delivery row.
  const providerEventId = 'invalid:' + payloadHash
  return prisma.webhookDelivery.upsert({
    where: { provider_providerEventId: { provider: input.provider, providerEventId } },
    create: { provider: input.provider, providerEventId, eventType: 'unverified', payloadHash, status: 'SIGNATURE_FAILED', lastError: input.error.slice(0, 1000) },
    update: {},
  })
}

function runnableWebhookWhere(now: Date): Prisma.WebhookDeliveryWhereInput {
  return { rawPayload: { not: null }, attempts: { lt: MAX_WEBHOOK_DELIVERY_ATTEMPTS }, OR: [
    { status: 'RECEIVED', OR: [{ claimToken: null }, { leaseExpiresAt: { lte: now } }] },
    { status: 'RETRY_PENDING', nextRetryAt: { lte: now }, claimToken: null },
  ] }
}

export async function claimWebhookDelivery(id: string, manualReplay = false, now = new Date()) {
  const [delivery] = await prisma.webhookDelivery.updateManyAndReturn({
    where: { id, ...(manualReplay
      ? { rawPayload: { not: null }, status: { not: 'SIGNATURE_FAILED' as const }, OR: [{ claimToken: null }, { leaseExpiresAt: { lte: now } }] }
      : runnableWebhookWhere(now)) },
    data: { status: 'RECEIVED', claimToken: crypto.randomUUID(), leaseExpiresAt: new Date(now.getTime() + DELIVERY_LEASE_MS), attempts: { increment: 1 }, lastRetriedAt: now, nextRetryAt: null, lastError: null },
  })
  return delivery ?? null
}

export const claimWebhookDeliveryForRetry = (id: string, now = new Date()) => claimWebhookDelivery(id, false, now)

export async function markWebhookDeliveryProcessed(input: { provider: string; providerEventId: string; claimToken: string }) {
  const [delivery] = await prisma.webhookDelivery.updateManyAndReturn({
    where: { provider: input.provider, providerEventId: input.providerEventId, claimToken: input.claimToken, leaseExpiresAt: { gt: new Date() } },
    data: { status: 'PROCESSED', processedAt: new Date(), lastError: null, nextRetryAt: null, claimToken: null, leaseExpiresAt: null },
  })
  if (!delivery) return null
  await emitInternalEvent('webhook.delivered', { direction: 'inbound', provider: delivery.provider, providerEventId: delivery.providerEventId, eventType: delivery.eventType, attempts: delivery.attempts })
  return delivery
}

export async function markWebhookDeliveryFailed(input: { provider: string; providerEventId: string; claimToken: string; error: string; retryable?: boolean }) {
  const delivery = await prisma.webhookDelivery.findFirst({ where: { provider: input.provider, providerEventId: input.providerEventId, claimToken: input.claimToken }, select: { attempts: true } })
  if (!delivery) return null
  const schedule = getRetrySchedule(delivery.attempts, input.retryable ?? true)
  const [updated] = await prisma.webhookDelivery.updateManyAndReturn({
    where: { provider: input.provider, providerEventId: input.providerEventId, claimToken: input.claimToken, leaseExpiresAt: { gt: new Date() } },
    data: { status: schedule.status, processedAt: null, lastError: input.error.slice(0, 4000), nextRetryAt: schedule.nextRetryAt, claimToken: null, leaseExpiresAt: null },
  })
  if (!updated) return null
  await emitInternalEvent('webhook.failed', { direction: 'inbound', provider: updated.provider, providerEventId: updated.providerEventId, eventType: updated.eventType, error: input.error, attempts: updated.attempts, retryable: Boolean(schedule.nextRetryAt) })
  return updated
}

export async function getDueWebhookDeliveriesForRetry(limit = 10, now = new Date()) {
  // A final-attempt crash must become visible exhaustion instead of remaining
  // stranded in RECEIVED forever.
  await prisma.webhookDelivery.updateMany({
    where: { status: 'RECEIVED', attempts: { gte: MAX_WEBHOOK_DELIVERY_ATTEMPTS }, leaseExpiresAt: { lte: now } },
    data: { status: 'RETRY_EXHAUSTED', claimToken: null, leaseExpiresAt: null, lastError: 'Attempt limit reached after expired worker claim' },
  })
  return prisma.webhookDelivery.findMany({ where: runnableWebhookWhere(now), select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(50, limit)) })
}

export async function getWebhookDeliveryDiagnostics(id: string) {
  const delivery = await getWebhookDeliveryById(id)
  if (!delivery) return null

  let parsedPayload: { data?: { object?: { id?: unknown } } } | null = null
  try {
    parsedPayload = delivery.rawPayload ? JSON.parse(delivery.rawPayload) : null
  } catch {
    parsedPayload = null
  }

  const paymentIntentId =
    typeof parsedPayload?.data?.object?.id === 'string' ? parsedPayload.data.object.id : null

  const [checkoutSession, payment] = paymentIntentId
    ? await Promise.all([
        prisma.checkoutSession.findUnique({
          where: { paymentIntentId },
          select: {
            id: true,
            status: true,
            email: true,
            totalCents: true,
            currency: true,
            failureReason: true,
            completedAt: true,
            updatedAt: true,
          },
        }),
        prisma.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
          select: {
            id: true,
            orderId: true,
            status: true,
            amountCents: true,
            currency: true,
            createdAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                paymentStatus: true,
                fulfillmentStatus: true,
                totalCents: true,
                currency: true,
                createdAt: true,
              },
            },
          },
        }),
      ])
    : [null, null]

  const replayBlockers = getReplayBlockers(delivery)
  const retryBlockers = getRetryBlockers(delivery)

  const { rawPayload, claimToken: _claimToken, ...safeDelivery } = delivery

  return {
    delivery: {
      ...safeDelivery,
      hasVerifiedPayload: Boolean(delivery.rawPayload),
      rawPayloadBytes: delivery.rawPayload ? Buffer.byteLength(delivery.rawPayload, 'utf8') : 0,
    },
    retryPolicy: {
      maxAttempts: MAX_WEBHOOK_DELIVERY_ATTEMPTS,
      canReplay: replayBlockers.length === 0,
      canRetry: retryBlockers.length === 0,
      replayBlockers,
      retryBlockers,
    },
    related: {
      paymentIntentId,
      checkoutSession,
      payment: payment
        ? {
            id: payment.id,
            orderId: payment.orderId,
            status: payment.status,
            amount: centsToDollars(payment.amountCents),
            amountCents: payment.amountCents,
            currency: payment.currency,
            createdAt: payment.createdAt,
          }
        : null,
      order: payment?.order ?? null,
    },
  }
}

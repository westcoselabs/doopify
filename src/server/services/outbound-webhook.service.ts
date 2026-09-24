import crypto from 'node:crypto'
import type { OutboundWebhookDelivery, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { env, getEnvironmentSecret } from '@/lib/env'
import { outboundDestinations } from '@/server/config/outbound-webhooks'
import type { DoopifyEventName, DoopifyEvents } from '@/server/events/types'
import { DELIVERY_LEASE_MS, PROVIDER_TIMEOUT_MS, readBoundedResponse, runBounded } from '@/server/jobs/delivery-runtime'
import { recordAuditLogBestEffort, type AuditActor } from '@/server/services/audit-log.service'

const MAX_ATTEMPTS = 5
const availableClaim = (now: Date) => ({ OR: [{ claimToken: null }, { leaseExpiresAt: { lte: now } }] })
const dueWhere = (now: Date): Prisma.OutboundWebhookDeliveryWhereInput => ({
  ...availableClaim(now), status: { in: ['PENDING', 'RETRYING'] },
  AND: [{ OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }],
})

export function createOutboundWebhookSignature(input: { payload: string; secret: string; timestamp: string | number }) {
  return 'sha256=' + crypto.createHmac('sha256', input.secret).update(input.timestamp + '.' + input.payload).digest('hex')
}

export async function queueOutboundWebhooks<K extends DoopifyEventName>(event: K, payload: DoopifyEvents[K]) {
  const destinations = outboundDestinations.filter((destination) => destination.events.includes(event))
  if (!destinations.length) return { queued: 0 }
  const body = JSON.stringify({ event, data: payload, createdAt: new Date().toISOString() })
  await prisma.outboundWebhookDelivery.createMany({ data: destinations.map((destination) => ({
    integrationId: destination.id, destinationName: destination.name, destinationUrl: destination.url,
    event, payload: body, status: 'PENDING',
  })) })
  return { queued: destinations.length }
}

export async function processOutboundWebhook(deliveryId: string, manualRetry = false) {
  const now = new Date()
  const claimToken = crypto.randomUUID()
  const [delivery] = await prisma.outboundWebhookDelivery.updateManyAndReturn({
    where: { id: deliveryId, ...(manualRetry ? { status: { in: ['PENDING', 'RETRYING', 'FAILED', 'EXHAUSTED'] as OutboundWebhookDelivery['status'][] }, ...availableClaim(now) } : dueWhere(now)) },
    data: { status: 'RETRYING', claimToken, leaseExpiresAt: new Date(now.getTime() + DELIVERY_LEASE_MS), lastRetriedAt: now, attempts: { increment: 1 } },
  })
  if (!delivery) return null
  let status: OutboundWebhookDelivery['status'] = 'SUCCESS'
  let statusCode: number | null = null
  let responseBody: string | null = null
  let lastError: string | null = null
  try {
    if (!manualRetry && delivery.attempts > MAX_ATTEMPTS) throw new Error('Delivery attempt limit reached after expired claim')
    const destination = outboundDestinations.find((entry) => entry.id === delivery.integrationId)
    // Never redirect an existing payload to a newly configured endpoint.
    if (!destination || !delivery.destinationUrl || destination.url !== delivery.destinationUrl) throw new Error('Destination snapshot does not match developer configuration; operator review required')
    const url = new URL(delivery.destinationUrl)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('Invalid destination URL')
    const secret = getEnvironmentSecret(destination.secretEnv)
    if (!secret) throw new Error('Missing environment variable: ' + destination.secretEnv)
    const headers: Record<string, string> = {}
    for (const [name, reference] of Object.entries(destination.headers ?? {})) {
      if (!/^[!#$%&'*+.^_|~0-9A-Za-z-]+$/.test(name) || /^(host|content-length|content-type|x-doopify-.*)$/i.test(name)) throw new Error('Reserved or invalid outbound header')
      const value = getEnvironmentSecret(reference)
      if (!value) throw new Error('Missing environment variable: ' + reference)
      headers[name] = value
    }
    const timestamp = Math.floor(now.getTime() / 1000)
    Object.assign(headers, { 'Content-Type': 'application/json', 'User-Agent': 'Doopify-Webhook-Dispatcher/1.0', 'X-Doopify-Delivery': delivery.id, 'X-Doopify-Event': delivery.event, 'X-Doopify-Timestamp': String(timestamp), 'X-Doopify-Signature': createOutboundWebhookSignature({ payload: delivery.payload, secret, timestamp }) })
    const response = await fetch(url, { method: 'POST', headers, body: delivery.payload, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
    statusCode = response.status
    responseBody = await readBoundedResponse(response)
    if (!response.ok) throw new Error('HTTP Error ' + response.status)
  } catch (error) {
    lastError = error instanceof Error ? error.message.slice(0, 1000) : 'Outbound delivery failed'
    status = delivery.attempts >= MAX_ATTEMPTS ? 'EXHAUSTED' : 'RETRYING'
  }
  const [updated] = await prisma.outboundWebhookDelivery.updateManyAndReturn({
    where: { id: delivery.id, claimToken, leaseExpiresAt: { gt: new Date() } },
    data: { status, statusCode, responseBody, lastError, claimToken: null, leaseExpiresAt: null,
      processedAt: status === 'RETRYING' ? null : new Date(),
      nextRetryAt: status === 'RETRYING' ? new Date(Date.now() + 60_000 * 3 ** (delivery.attempts - 1)) : null },
  })
  if (!updated) return null
  const { emitInternalEvent } = await import('@/server/events/dispatcher')
  const event = { direction: 'outbound' as const, provider: 'merchant_webhook', deliveryId: updated.id, integrationId: updated.integrationId, event: updated.event, statusCode, attempts: updated.attempts }
  if (status === 'SUCCESS') await emitInternalEvent('webhook.delivered', event)
  else await emitInternalEvent('webhook.failed', { ...event, error: lastError ?? 'Delivery failed', retryable: status === 'RETRYING' })
  return updated
}

export async function processDueOutboundDeliveries(limit = 50) {
  const deliveries = await prisma.outboundWebhookDelivery.findMany({ where: dueWhere(new Date()), select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(100, limit)) })
  const results = await runBounded(deliveries, (delivery) => processOutboundWebhook(delivery.id))
  return { processed: results.length, success: results.filter((result) => result.status === 'fulfilled' && result.value?.status === 'SUCCESS').length, failures: results.filter((result) => result.status === 'rejected' || (result.status === 'fulfilled' && result.value && result.value.status !== 'SUCCESS')).length }
}

export async function retryOutboundWebhookDelivery(deliveryId: string, actor?: AuditActor | null) {
  const result = await processOutboundWebhook(deliveryId, true)
  if (!result) return null
  const delivery = result
  await recordAuditLogBestEffort({ action: 'outbound_webhook.manual_retry', actor: actor ?? null, resource: { type: 'OutboundWebhookDelivery', id: deliveryId }, summary: 'Manual retry triggered for outbound delivery ' + deliveryId, snapshot: { deliveryId, integrationId: delivery.integrationId, eventType: delivery.event, newStatus: result?.status ?? 'PENDING' }, redactions: ['signing secret', 'custom header secrets', 'raw payload', 'provider response body'] })
  return result ? { id: result.id, status: result.status, attempts: result.attempts, lastError: result.lastError } : null
}

export async function getOutboundWebhookDeliveries(input: { page: number; pageSize: number; status: OutboundWebhookDelivery['status'] | 'ALL' }) {
  const where = input.status === 'ALL' ? {} : { status: input.status }
  const [total, deliveries] = await Promise.all([
    prisma.outboundWebhookDelivery.count({ where }),
    prisma.outboundWebhookDelivery.findMany({ where, select: { id: true, integrationId: true, destinationName: true, destinationUrl: true, event: true, status: true, statusCode: true, attempts: true, lastError: true, createdAt: true, updatedAt: true, processedAt: true, nextRetryAt: true, lastRetriedAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
  ])
  return { deliveries, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } }
}

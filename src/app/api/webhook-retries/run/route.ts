import { err, ok } from '@/lib/api'
import { env } from '@/lib/env'
import { getDueWebhookDeliveriesForRetry } from '@/server/services/webhook-delivery.service'
import { processInboundWebhook } from '@/server/services/inbound-webhook-processing.service'
import { processDueOutboundDeliveries } from '@/server/services/outbound-webhook.service'
import { runBounded } from '@/server/jobs/delivery-runtime'

export const runtime = 'nodejs'

function isAuthorized(req: Request) {
  const secret = env.WEBHOOK_RETRY_SECRET
  if (!secret) return false

  const authorization = req.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
  const headerSecret = req.headers.get('x-webhook-retry-secret')

  return bearer === secret || headerSecret === secret
}

export async function POST(req: Request) {
  if (!env.WEBHOOK_RETRY_SECRET) {
    return err('Webhook retry secret is not configured', 503)
  }

  if (!isAuthorized(req)) {
    return err('Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 10))
  const dueDeliveries = await getDueWebhookDeliveriesForRetry(limit)
  // Both bounded queues share the request's time window rather than consuming
  // two consecutive runner budgets (four workers per queue, eight in total).
  const [settled, outboundResults] = await Promise.all([
    runBounded(dueDeliveries, (delivery) => processInboundWebhook(delivery.id)),
    processDueOutboundDeliveries(),
  ])
  const results = settled.map((result) => result.status === 'fulfilled' ? result.value : { status: 'FAILED', error: 'Webhook retry failed' })

  return ok({
    processedInbound: results.length,
    processedOutbound: outboundResults.processed,
    results,
    outboundResults,
  })
}

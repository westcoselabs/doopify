import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { getWebhookDeliveryById } from '@/server/services/webhook-delivery.service'
import { processInboundWebhook } from '@/server/services/inbound-webhook-processing.service'
import { auditActorFromUser, recordAuditLogBestEffort } from '@/server/services/audit-log.service'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  const delivery = await getWebhookDeliveryById(id)
  if (!delivery) return err('Webhook delivery not found', 404)
  if (delivery.provider !== 'stripe' || !delivery.rawPayload || delivery.status === 'SIGNATURE_FAILED') return err('Replay requires a verified Stripe delivery', 400)
  const result = await processInboundWebhook(id, true)
  if (!result) return err('Delivery is already being processed', 409)
  await recordAuditLogBestEffort({
    action: result.status === 'PROCESSED' ? 'inbound_webhook.manual_replay' : 'inbound_webhook.manual_replay_failed',
    actor: auditActorFromUser(auth.user), resource: { type: 'WebhookDelivery', id }, summary: 'Manual replay for inbound delivery ' + id,
    snapshot: { deliveryId: id, provider: delivery.provider, providerEventId: delivery.providerEventId, previousStatus: delivery.status, newStatus: result.status, attemptCount: result.attempts },
    redactions: ['raw payload', 'webhook signature', 'provider secrets'],
  })
  return result.status === 'PROCESSED' ? ok(result) : err('Webhook replay failed', 500)
}

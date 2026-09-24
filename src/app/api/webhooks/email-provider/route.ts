import { Webhook } from 'svix'

import { env } from '@/lib/env'
import { recordVerifiedWebhookDelivery, recordRejectedWebhook } from '@/server/services/webhook-delivery.service'
import { parseEmailProviderWebhookPayload } from '@/server/services/email-delivery.service'
import { processInboundWebhook } from '@/server/services/inbound-webhook-processing.service'

export const runtime = 'nodejs'

function getVerificationHeaders(req: Request) {
  return {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }
}

function verifyEmailProviderWebhookPayload(payload: string, req: Request) {
  const headers = getVerificationHeaders(req)
  if (!headers.id || !headers.timestamp || !headers.signature) {
    throw new Error('Missing webhook signature headers')
  }

  if (!env.RESEND_WEBHOOK_SECRET) {
    throw new Error('RESEND_WEBHOOK_SECRET is not configured')
  }

  const webhook = new Webhook(env.RESEND_WEBHOOK_SECRET)
  webhook.verify(payload, {
    id: headers.id,
    timestamp: headers.timestamp,
    signature: headers.signature,
  })
}

export async function POST(req: Request) {
  if (!env.RESEND_WEBHOOK_SECRET) return new Response('RESEND_WEBHOOK_SECRET is not configured', { status: 503 })
  const payload = await req.text()
  try { verifyEmailProviderWebhookPayload(payload, req) }
  catch {
    await recordRejectedWebhook({ provider: 'resend', payload, error: 'Email webhook signature verification failed' })
    return new Response('Webhook signature verification failed', { status: 400 })
  }
  const event = parseEmailProviderWebhookPayload(payload)
  const providerEventId = req.headers.get('svix-id')
  if (!event || !providerEventId) return new Response('Invalid email webhook payload', { status: 400 })
  const delivery = await recordVerifiedWebhookDelivery({ provider: 'resend', providerEventId, eventType: event.type, payload })
  if (delivery.status === 'PROCESSED') return new Response('OK')
  const result = await processInboundWebhook(delivery.id)
  return new Response(result?.status === 'PROCESSED' ? 'OK' : 'Delivery pending or failed', { status: !result ? 202 : result.status === 'PROCESSED' ? 200 : 500 })
}

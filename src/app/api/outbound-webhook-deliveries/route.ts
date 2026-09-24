import { ok, err } from '@/lib/api'
import { getOutboundWebhookDeliveries } from '@/server/services/outbound-webhook.service'
import { requireAdmin } from '@/server/auth/require-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED', 'RETRYING', 'EXHAUSTED', 'ALL'])

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1))
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(searchParams.get('pageSize')) || 20)))
    const parsedStatus = statusSchema.safeParse(searchParams.get('status') || 'ALL')
    if (!parsedStatus.success) return err('Invalid outbound webhook delivery status', 400)

    return ok(await getOutboundWebhookDeliveries({ page, pageSize, status: parsedStatus.data }))
  } catch (error) {
    console.error('[GET /api/outbound-webhook-deliveries]', error)
    return err('Failed to fetch outbound webhook deliveries', 500)
  }
}

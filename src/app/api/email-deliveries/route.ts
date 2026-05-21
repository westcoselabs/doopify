import { z } from 'zod'

import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { getEmailJobHealthSnapshot } from '@/server/jobs/email-job-health.service'
import { EMAIL_DELIVERY_STATUSES, getEmailDeliveries } from '@/server/services/email-delivery.service'

const EMAIL_DELIVERY_STATUS_FILTERS = ['ALL', ...EMAIL_DELIVERY_STATUSES] as const
const statusSchema = z.enum(EMAIL_DELIVERY_STATUS_FILTERS)
const templateSchema = z.enum(['ALL', 'order_confirmation', 'fulfillment_tracking'])

function parsePage(value: string | null, fallback: number) {
  const parsed = Number(value ?? '')
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.floor(parsed)
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const parsedStatus = statusSchema.safeParse(searchParams.get('status') ?? 'ALL')
    if (!parsedStatus.success) {
      return err('Invalid email delivery status', 400)
    }
    const parsedTemplate = templateSchema.safeParse(searchParams.get('template') ?? 'ALL')
    if (!parsedTemplate.success) {
      return err('Invalid email delivery template', 400)
    }

    const [deliveries, jobHealth] = await Promise.all([
      getEmailDeliveries({
        status: parsedStatus.data,
        template: parsedTemplate.data,
        page: parsePage(searchParams.get('page'), 1),
        pageSize: Math.min(100, parsePage(searchParams.get('pageSize'), 20)),
      }),
      getEmailJobHealthSnapshot(),
    ])

    return ok({
      ...deliveries,
      jobHealth,
    })
  } catch (error) {
    console.error('[GET /api/email-deliveries]', error)
    return err('Failed to fetch email deliveries', 500)
  }
}

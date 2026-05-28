import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { withRouteTiming } from '@/server/observability/timing'
import { resendOrderDigitalDownloads } from '@/server/services/digital-delivery-admin.service'
import {
  OrderIdentifierResolutionError,
  resolveOrderIdentifier,
} from '@/server/services/order-identifier.service'

interface Params {
  params: Promise<{ orderNumber: string }>
}

export async function POST(req: Request, { params }: Params) {
  return withRouteTiming(
    'POST /api/orders/[orderNumber]/digital-delivery/resend',
    req,
    async ({ step }) => {
      const auth = await requireAdmin(req)
      step('auth')
      if (!auth.ok) return auth.response

      const { orderNumber } = await params

      try {
        const resolvedOrder = await resolveOrderIdentifier(orderNumber)
        step('resolve_order')
        const result = await resendOrderDigitalDownloads(resolvedOrder.orderId)
        step('resend')

        if (!result.queued) {
          return err(
            result.message,
            result.reason === 'MISSING_CUSTOMER_EMAIL' ? 409 : 400
          )
        }

        return ok(result)
      } catch (error) {
        if (error instanceof OrderIdentifierResolutionError) {
          return err(error.message, error.code === 'INVALID_IDENTIFIER' ? 400 : 404)
        }
        console.error('[POST /api/orders/[orderNumber]/digital-delivery/resend]', error)
        return err('Failed to resend digital delivery email', 500)
      }
    }
  )
}

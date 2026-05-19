import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { withRouteTiming } from '@/server/observability/timing'
import { getAdminOrderDetailTimelineByOrderNumber } from '@/server/services/admin-order-detail.service'
import {
  OrderIdentifierResolutionError,
  resolveOrderIdentifier,
} from '@/server/services/order-identifier.service'

interface Params {
  params: Promise<{ orderNumber: string }>
}

export async function GET(req: Request, { params }: Params) {
  return withRouteTiming('GET /api/orders/[orderNumber]/detail/timeline', req, async ({ step }) => {
    const auth = await requireAdmin(req)
    step('auth')
    if (!auth.ok) return auth.response

    const { orderNumber } = await params

    try {
      const resolvedOrder = await resolveOrderIdentifier(orderNumber)
      step('resolve_order')
      const timeline = await getAdminOrderDetailTimelineByOrderNumber(resolvedOrder.orderNumber)
      step('load_timeline')
      if (!timeline) return err('Order not found', 404)
      return ok(timeline)
    } catch (error) {
      if (error instanceof OrderIdentifierResolutionError) {
        return err(error.message, error.code === 'INVALID_IDENTIFIER' ? 400 : 404)
      }
      console.error('[GET /api/orders/[orderNumber]/detail/timeline]', error)
      return err('Failed to fetch order timeline', 500)
    }
  })
}


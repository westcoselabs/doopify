import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { withRouteTiming } from '@/server/observability/timing'
import { getOrderDigitalDeliverySummary } from '@/server/services/digital-delivery-admin.service'
import {
  OrderIdentifierResolutionError,
  resolveOrderIdentifier,
} from '@/server/services/order-identifier.service'

interface Params {
  params: Promise<{ orderNumber: string }>
}

export async function GET(req: Request, { params }: Params) {
  return withRouteTiming('GET /api/orders/[orderNumber]/digital-delivery', req, async ({ step }) => {
    const auth = await requireAdmin(req)
    step('auth')
    if (!auth.ok) return auth.response

    const { orderNumber } = await params

    try {
      const resolvedOrder = await resolveOrderIdentifier(orderNumber)
      step('resolve_order')
      const summary = await getOrderDigitalDeliverySummary(resolvedOrder.orderId)
      step('load_summary')
      return ok(summary)
    } catch (error) {
      if (error instanceof OrderIdentifierResolutionError) {
        return err(error.message, error.code === 'INVALID_IDENTIFIER' ? 400 : 404)
      }
      console.error('[GET /api/orders/[orderNumber]/digital-delivery]', error)
      return err('Failed to fetch digital delivery summary', 500)
    }
  })
}

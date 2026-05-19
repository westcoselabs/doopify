import { ok, err } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { withRouteTiming } from '@/server/observability/timing'
import { getOrders } from '@/server/services/order.service'
import type { OrderStatus, PaymentStatus, FulfillmentStatus } from '@prisma/client'

export async function GET(req: Request) {
  return withRouteTiming('GET /api/orders', req, async ({ step }) => {
    const auth = await requireAdmin(req)
    step('auth')
    if (!auth.ok) return auth.response

    try {
      const { searchParams } = new URL(req.url)
      const result = await getOrders({
        status: (searchParams.get('status') as OrderStatus) || undefined,
        paymentStatus: (searchParams.get('paymentStatus') as PaymentStatus) || undefined,
        fulfillmentStatus: (searchParams.get('fulfillmentStatus') as FulfillmentStatus) || undefined,
        search: searchParams.get('search') || undefined,
        page: Number(searchParams.get('page') || 1),
        pageSize: Number(searchParams.get('pageSize') || 20),
      })
      step('query')
      return ok(result)
    } catch (e) {
      console.error('[GET /api/orders]', e)
      return err('Failed to fetch orders', 500)
    }
  })
}

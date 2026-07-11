import { ok, err } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { getAnalytics } from '@/server/services/order.service'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const data = await getAnalytics()
    return ok(data)
  } catch (e) {
    console.error('[GET /api/analytics]', e)
    return err('Failed to fetch analytics', 500)
  }
}

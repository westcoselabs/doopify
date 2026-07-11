import { err, ok } from '@/lib/api'
import { getCheckoutStatus } from '@/server/services/checkout.service'

export async function GET(req: Request) {
  const paymentIntentId = new URL(req.url).searchParams.get('payment_intent')
  const statusAccessToken = new URL(req.url).searchParams.get('status_token')
  if (!paymentIntentId) {
    return err('payment_intent is required')
  }
  if (!statusAccessToken) {
    return err('status_token is required')
  }

  try {
    const status = await getCheckoutStatus(paymentIntentId, statusAccessToken)
    if (!status) {
      return err('Checkout status is unavailable', 404)
    }
    return ok(status)
  } catch (error) {
    console.error('[GET /api/checkout/status]', error)
    return err('Failed to fetch checkout status', 500)
  }
}

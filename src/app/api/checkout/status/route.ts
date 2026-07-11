import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { consumeRateLimit } from '@/lib/rate-limit'
import { getCheckoutStatus } from '@/server/services/checkout.service'

function requestIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: Request) {
  const rateLimit = await consumeRateLimit(`checkout-status:${requestIp(req)}`, {
    limit: Number(process.env.CHECKOUT_STATUS_RATE_LIMIT ?? 120),
    windowMs: 5 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many checkout status requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
      },
    })
  }

  const body = await parseBody(req)
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : null
  if (!payload || typeof payload.paymentIntentId !== 'string' || typeof payload.statusToken !== 'string') {
    return unprocessable('paymentIntentId and statusToken are required')
  }

  try {
    const status = await getCheckoutStatus(payload.paymentIntentId, payload.statusToken)
    if (!status) {
      // Do not reveal whether a payment intent or checkout session exists.
      return err('Checkout status is unavailable', 404)
    }
    return ok(status)
  } catch (error) {
    console.error('[GET /api/checkout/status]', error)
    return err('Failed to fetch checkout status', 500)
  }
}

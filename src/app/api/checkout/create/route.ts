import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { consumeRateLimit } from '@/lib/rate-limit'
import { createHash } from 'node:crypto'
import { withRouteTiming } from '@/server/observability/timing'
import { runCreateCheckoutWorkflow } from '@/workflows/checkout/create-checkout.workflow'

const itemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
})

const addressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  province: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().min(2),
  phone: z.string().optional(),
})

const schema = z.object({
  checkoutAttemptId: z.string().uuid(),
  statusAccessToken: z.string().min(32).max(256),
  email: z.string().email(),
  items: z.array(itemSchema).min(1),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  discountCode: z.string().trim().min(1).max(64).optional(),
  selectedShippingQuoteId: z.string().trim().min(1).max(200).optional(),
})

export async function POST(req: Request) {
  return withRouteTiming('POST /api/checkout/create', req, async ({ step }) => {
    const body = await parseBody(req)
    step('parse_body')
    if (!body) {
      return err('Invalid request body')
    }

    const parsed = schema.safeParse(body)
    step('validate')
    if (!parsed.success) {
      return unprocessable('Checkout payload is invalid', parsed.error.flatten())
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    const emailKey = createHash('sha256').update(parsed.data.email.trim().toLowerCase()).digest('hex')
    const [ipLimit, emailLimit] = await Promise.all([
      consumeRateLimit(`checkout-create:ip:${ip}`, { limit: Number(process.env.CHECKOUT_CREATE_IP_RATE_LIMIT ?? 30), windowMs: 10 * 60 * 1000 }),
      consumeRateLimit(`checkout-create:email:${emailKey}`, { limit: Number(process.env.CHECKOUT_CREATE_EMAIL_RATE_LIMIT ?? 10), windowMs: 10 * 60 * 1000 }),
    ])
    const blocked = !ipLimit.allowed ? ipLimit : !emailLimit.allowed ? emailLimit : null
    if (blocked) {
      return new Response(JSON.stringify({ success: false, error: 'Too many checkout attempts' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.max(1, Math.ceil(blocked.retryAfterMs / 1000))) },
      })
    }

    try {
      const checkout = await runCreateCheckoutWorkflow(parsed.data, { step })
      step('create_payment_intent')
      return ok(checkout, 201)
    } catch (error) {
      console.error('[POST /api/checkout/create]', error)
      const message = error instanceof Error ? error.message : 'Failed to create checkout payment intent'
      return err(message, 400)
    }
  })
}

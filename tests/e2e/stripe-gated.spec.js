import { test, expect } from '@playwright/test'

const stripeEnvReady = Boolean(
  process.env.STRIPE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET
)

const stripeSmokeEnabled = process.env.E2E_STRIPE_SMOKE === '1' && stripeEnvReady

test.describe('Stripe Gated Smoke (non-mutating)', () => {
  test.skip(
    !stripeSmokeEnabled,
    'Skipped: set E2E_STRIPE_SMOKE=1 and Stripe env vars to run Stripe-gated E2E checks.'
  )

  test('checkout stripe config endpoint is available with publishable key', async ({ request }) => {
    const response = await request.get('/api/checkout/stripe-config')
    expect(response.ok()).toBeTruthy()

    const payload = await response.json()
    expect(payload?.success).toBe(true)
    expect(typeof payload?.data?.publishableKey).toBe('string')
    expect(payload?.data?.publishableKey.length).toBeGreaterThan(0)
    expect(payload?.data?.publishableKey.startsWith('pk_')).toBe(true)
  })

  test('stripe webhook endpoint rejects unsigned payloads safely', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe', {
      headers: {
        'content-type': 'application/json',
      },
      data: {
        id: 'evt_e2e_unsigned',
        type: 'payment_intent.succeeded',
      },
    })

    expect(response.status()).toBe(400)
    const payload = await response.json()
    expect(payload?.success).toBe(false)
  })
})

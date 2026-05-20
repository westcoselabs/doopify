import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyStripeWebhookSignature: vi.fn(),
  processStripeWebhookEvent: vi.fn(),
  recordWebhookDeliveryAttempt: vi.fn(),
  storeVerifiedWebhookPayload: vi.fn(),
  markWebhookDeliveryProcessed: vi.fn(),
  markWebhookDeliveryFailed: vi.fn(),
  getStripeRuntimeConnection: vi.fn(),
  getStripeWebhookSecretSelection: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  verifyStripeWebhookSignature: mocks.verifyStripeWebhookSignature,
}))

vi.mock('@/server/services/stripe-webhook.service', () => ({
  parseStripeWebhookEventPayload: (payload: string) => {
    try {
      const event = JSON.parse(payload)
      if (!event || typeof event !== 'object') return null
      if (typeof event.id !== 'string' || typeof event.type !== 'string') return null
      if (!event.data || typeof event.data !== 'object' || !('object' in event.data)) return null
      return event
    } catch {
      return null
    }
  },
  processStripeWebhookEvent: mocks.processStripeWebhookEvent,
}))

vi.mock('@/server/services/webhook-delivery.service', () => ({
  recordWebhookDeliveryAttempt: mocks.recordWebhookDeliveryAttempt,
  storeVerifiedWebhookPayload: mocks.storeVerifiedWebhookPayload,
  markWebhookDeliveryProcessed: mocks.markWebhookDeliveryProcessed,
  markWebhookDeliveryFailed: mocks.markWebhookDeliveryFailed,
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeRuntimeConnection: mocks.getStripeRuntimeConnection,
  getStripeWebhookSecretSelection: mocks.getStripeWebhookSecretSelection,
}))

import { POST } from './route'

const originalEnv = { ...process.env }

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    process.env = { ...originalEnv }
    mocks.verifyStripeWebhookSignature.mockImplementation(() => undefined)
    mocks.processStripeWebhookEvent.mockResolvedValue(undefined)
    mocks.getStripeRuntimeConnection.mockResolvedValue({
      source: 'env',
      verified: false,
      mode: 'test',
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_hidden',
      webhookSecret: 'whsec_env_runtime',
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })
    mocks.getStripeWebhookSecretSelection.mockResolvedValue({
      source: 'env',
      webhookSecret: 'whsec_env_runtime',
    })
    mocks.recordWebhookDeliveryAttempt.mockResolvedValue({
      provider: 'stripe',
      providerEventId: 'evt_test',
    })
  })

  it('rejects invalid webhook signatures before processing the event', async () => {
    mocks.verifyStripeWebhookSignature.mockImplementation(() => {
      throw new Error('Stripe webhook signature verification failed')
    })

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'bad-signature',
        },
        body: JSON.stringify({
          id: 'evt_bad',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_bad',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Stripe webhook signature verification failed')
    expect(mocks.verifyStripeWebhookSignature).toHaveBeenCalledWith(
      expect.any(String),
      'bad-signature',
      'whsec_env_runtime'
    )
    expect(mocks.processStripeWebhookEvent).not.toHaveBeenCalled()
    expect(mocks.recordWebhookDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'stripe',
        providerEventId: 'evt_bad',
        eventType: 'payment_intent.succeeded',
      })
    )
    expect(mocks.markWebhookDeliveryFailed).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
      status: 'SIGNATURE_FAILED',
      error: 'Stripe webhook signature verification failed',
    })
    expect(mocks.storeVerifiedWebhookPayload).not.toHaveBeenCalled()
    expect(mocks.markWebhookDeliveryProcessed).not.toHaveBeenCalled()
  })

  it('verifies signatures with DB webhook secret when verified DB runtime exists', async () => {
    mocks.getStripeRuntimeConnection.mockResolvedValueOnce({
      source: 'db',
      verified: true,
      mode: 'live',
      publishableKey: 'pk_live_public',
      secretKey: 'sk_live_hidden',
      webhookSecret: 'whsec_db_runtime',
      accountId: 'acct_live_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    })
    mocks.getStripeWebhookSecretSelection.mockResolvedValueOnce({
      source: 'db',
      webhookSecret: 'whsec_db_runtime',
    })

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: JSON.stringify({
          id: 'evt_db',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_db',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.verifyStripeWebhookSignature).toHaveBeenCalledWith(
      expect.any(String),
      'good-signature',
      'whsec_db_runtime'
    )
  })

  it('returns a setup error when no webhook secret is configured', async () => {
    mocks.getStripeWebhookSecretSelection.mockResolvedValueOnce({
      source: 'none',
      webhookSecret: null,
    })

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: JSON.stringify({
          id: 'evt_missing_secret',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_missing_secret',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toContain('Stripe webhook signing secret is not configured')
    expect(mocks.verifyStripeWebhookSignature).not.toHaveBeenCalled()
    expect(mocks.markWebhookDeliveryFailed).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
      error: expect.stringContaining('Stripe webhook signing secret is not configured'),
      retryable: false,
    })
  })

  it('rejects malformed payloads without storing a verified payload or scheduling retry', async () => {
    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: '{"not":"stripe"}',
      })
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid Stripe webhook payload')
    expect(mocks.storeVerifiedWebhookPayload).not.toHaveBeenCalled()
    expect(mocks.markWebhookDeliveryFailed).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
      error: 'Invalid Stripe webhook payload',
      retryable: false,
    })
  })

  it('records processed payment_intent.succeeded events', async () => {
    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: JSON.stringify({
          id: 'evt_ok',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_ok',
              amount: 5999,
              currency: 'usd',
              status: 'succeeded',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.verifyStripeWebhookSignature).toHaveBeenCalledWith(
      expect.any(String),
      'good-signature',
      'whsec_env_runtime'
    )
    expect(mocks.processStripeWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt_ok',
        type: 'payment_intent.succeeded',
      })
    )
    expect(mocks.processStripeWebhookEvent).toHaveBeenCalledTimes(1)
    expect(mocks.storeVerifiedWebhookPayload).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
      rawPayload: expect.stringContaining('"evt_ok"'),
    })
    expect(mocks.markWebhookDeliveryProcessed).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
    })
    expect(mocks.markWebhookDeliveryFailed).not.toHaveBeenCalled()
  })

  it('records failed delivery status when webhook processing throws', async () => {
    mocks.processStripeWebhookEvent.mockRejectedValue(new Error('Order finalization failed'))

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: JSON.stringify({
          id: 'evt_fail',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_fail',
              amount: 5999,
              currency: 'usd',
              status: 'succeeded',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Webhook processing failed')
    expect(mocks.markWebhookDeliveryFailed).toHaveBeenCalledWith({
      provider: 'stripe',
      providerEventId: 'evt_test',
      error: 'Order finalization failed',
      retryable: true,
    })
    expect(mocks.markWebhookDeliveryProcessed).not.toHaveBeenCalled()
  })

  it('keeps webhook route timing instrumentation active when enabled', async () => {
    vi.stubEnv('DOOPIFY_ROUTE_TIMING', '1')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'good-signature',
        },
        body: JSON.stringify({
          id: 'evt_timing',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_timing',
              amount: 5999,
              currency: 'usd',
              status: 'succeeded',
            },
          },
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.processStripeWebhookEvent).toHaveBeenCalledTimes(1)
    const routeTimingCall = logSpy.mock.calls.find(
      (call) =>
        call[0] === '[route-timing]' &&
        typeof call[1] === 'string' &&
        call[1].includes('"route":"POST /api/webhooks/stripe"')
    )
    expect(routeTimingCall).toBeTruthy()
  })
})

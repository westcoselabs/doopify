import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPaymentIntent: vi.fn(),
  getStripeSdkClient: vi.fn(),
}))

vi.mock('@/lib/stripe-client', () => ({
  getStripeSdkClient: mocks.getStripeSdkClient,
}))

import { createStripePaymentIntent } from './stripe'

describe('createStripePaymentIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStripeSdkClient.mockReturnValue({
      paymentIntents: {
        create: mocks.createPaymentIntent,
      },
    })
  })

  it('uses Stripe SDK paymentIntents.create with expected checkout payload', async () => {
    mocks.createPaymentIntent.mockResolvedValue({
      id: 'pi_sdk_1',
      client_secret: 'pi_secret_sdk_1',
      amount: 5999,
      currency: 'usd',
      latest_charge: 'ch_sdk_1',
      status: 'requires_payment_method',
      metadata: {
        checkoutEmail: 'buyer@example.com',
      },
      last_payment_error: null,
    })

    const result = await createStripePaymentIntent({
      amount: 5999,
      currency: 'USD',
      email: 'buyer@example.com',
      metadata: {
        checkoutEmail: 'buyer@example.com',
        ignoredEmpty: '',
      },
      secretKey: 'sk_test_db_runtime',
    })

    expect(mocks.getStripeSdkClient).toHaveBeenCalledWith('sk_test_db_runtime')
    expect(mocks.createPaymentIntent).toHaveBeenCalledWith({
      amount: 5999,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      receipt_email: 'buyer@example.com',
      metadata: {
        checkoutEmail: 'buyer@example.com',
      },
    })
    expect(result).toMatchObject({
      id: 'pi_sdk_1',
      client_secret: 'pi_secret_sdk_1',
      amount: 5999,
      currency: 'usd',
      latest_charge: 'ch_sdk_1',
      status: 'requires_payment_method',
      metadata: {
        checkoutEmail: 'buyer@example.com',
      },
      last_payment_error: null,
    })
  })

  it('passes a deterministic idempotency key when checkout supplies one', async () => {
    mocks.createPaymentIntent.mockResolvedValue({
      id: 'pi_idempotent', client_secret: 'secret', amount: 100, currency: 'usd', status: 'requires_payment_method', metadata: {}, latest_charge: null, last_payment_error: null,
    })

    await createStripePaymentIntent({ amount: 100, currency: 'USD', idempotencyKey: 'checkout:attempt_1' })

    expect(mocks.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, currency: 'usd' }),
      { idempotencyKey: 'checkout:attempt_1' }
    )
  })

  it('surfaces Stripe SDK errors with the same message', async () => {
    mocks.createPaymentIntent.mockRejectedValue(new Error('Stripe API unavailable'))

    await expect(
      createStripePaymentIntent({
        amount: 1000,
        currency: 'USD',
      })
    ).rejects.toThrow('Stripe API unavailable')
  })
})

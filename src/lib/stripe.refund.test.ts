import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createRefund: vi.fn(),
  getStripeSdkClient: vi.fn(),
}))

vi.mock('@/lib/stripe-client', () => ({
  getStripeSdkClient: mocks.getStripeSdkClient,
}))

import { createStripeRefund } from './stripe'

describe('createStripeRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStripeSdkClient.mockReturnValue({
      refunds: {
        create: mocks.createRefund,
      },
    })
  })

  it('uses Stripe SDK refunds.create with charge id precedence and idempotency options', async () => {
    mocks.createRefund.mockResolvedValue({
      id: 're_sdk_1',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_sdk_1',
      payment_intent: 'pi_sdk_1',
      reason: 'requested_by_customer',
    })

    const result = await createStripeRefund({
      chargeId: 'ch_sdk_1',
      paymentIntentId: 'pi_should_be_ignored_when_charge_present',
      amount: 5000,
      reason: 'requested_by_customer',
      idempotencyKey: 'refund:abc123',
    })

    expect(mocks.getStripeSdkClient).toHaveBeenCalledWith()
    expect(mocks.createRefund).toHaveBeenCalledWith(
      {
        charge: 'ch_sdk_1',
        amount: 5000,
        reason: 'requested_by_customer',
      },
      {
        idempotencyKey: 'refund:abc123',
      }
    )
    expect(result).toMatchObject({
      id: 're_sdk_1',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_sdk_1',
      payment_intent: 'pi_sdk_1',
      reason: 'requested_by_customer',
    })
  })

  it('falls back to payment intent when charge id is missing', async () => {
    mocks.createRefund.mockResolvedValue({
      id: 're_sdk_2',
      amount: 2500,
      currency: 'usd',
      status: 'succeeded',
      charge: null,
      payment_intent: 'pi_sdk_2',
      reason: null,
    })

    await createStripeRefund({
      paymentIntentId: 'pi_sdk_2',
      amount: 2500,
    })

    expect(mocks.createRefund).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_sdk_2',
        amount: 2500,
      },
      undefined
    )
  })

  it('throws when neither chargeId nor paymentIntentId is provided', async () => {
    await expect(createStripeRefund({ amount: 1000 })).rejects.toThrow(
      'createStripeRefund requires chargeId or paymentIntentId'
    )
  })
})

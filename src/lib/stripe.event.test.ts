import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  retrieveEvent: vi.fn(),
  getStripeSdkClient: vi.fn(),
}))

vi.mock('@/lib/stripe-client', () => ({
  getStripeSdkClient: mocks.getStripeSdkClient,
}))

import { getStripeEvent } from './stripe'

describe('getStripeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStripeSdkClient.mockReturnValue({
      events: {
        retrieve: mocks.retrieveEvent,
      },
    })
  })

  it('retrieves events through Stripe SDK with the configured SDK client', async () => {
    mocks.retrieveEvent.mockResolvedValue({
      id: 'evt_sdk_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_sdk_1',
          amount: 5000,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    })

    const result = await getStripeEvent('evt_sdk_1')

    expect(mocks.getStripeSdkClient).toHaveBeenCalledWith()
    expect(mocks.retrieveEvent).toHaveBeenCalledWith('evt_sdk_1')
    expect(result).toMatchObject({
      id: 'evt_sdk_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_sdk_1',
        },
      },
    })
  })

  it('surfaces Stripe SDK retrieval errors', async () => {
    mocks.retrieveEvent.mockRejectedValue(new Error('Stripe event unavailable'))

    await expect(getStripeEvent('evt_missing')).rejects.toThrow('Stripe event unavailable')
  })
})

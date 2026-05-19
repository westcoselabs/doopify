import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  completeCheckoutFromPaymentIntent: vi.fn(),
}))

vi.mock('@/server/services/checkout.service', () => ({
  completeCheckoutFromPaymentIntent: mocks.completeCheckoutFromPaymentIntent,
}))

import {
  finalizePaidOrderWorkflow,
  runFinalizePaidOrderWorkflow,
} from './finalize-paid-order.workflow'

describe('finalizePaidOrderWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defines explicit paid-order finalization workflow steps', () => {
    expect(finalizePaidOrderWorkflow.id).toBe('checkout.finalize_paid_order')
    expect(finalizePaidOrderWorkflow.steps.map((step) => step.id)).toEqual([
      'receive_verified_event_context',
      'preserve_idempotency_behavior',
      'finalize_checkout_order',
      'return_existing_result',
    ])
  })

  it('delegates paid-order finalization to existing checkout service', async () => {
    mocks.completeCheckoutFromPaymentIntent.mockResolvedValue({
      id: 'order_1001',
      orderNumber: 1001,
    })

    const paymentIntent = {
      id: 'pi_paid_1',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
    }
    const step = vi.fn()
    const result = await runFinalizePaidOrderWorkflow({ paymentIntent }, { step })

    expect(mocks.completeCheckoutFromPaymentIntent).toHaveBeenCalledWith(paymentIntent)
    expect(step).toHaveBeenCalledWith('workflow.finalize_paid_order.start')
    expect(step).toHaveBeenCalledWith('workflow.finalize_paid_order.complete')
    expect(result).toMatchObject({
      id: 'order_1001',
      orderNumber: 1001,
    })
  })

  it('preserves duplicate/idempotent finalization behavior from existing service', async () => {
    mocks.completeCheckoutFromPaymentIntent.mockResolvedValue({
      id: 'order_existing',
      orderNumber: 1002,
    })

    const paymentIntent = {
      id: 'pi_duplicate',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
    }

    const result = await runFinalizePaidOrderWorkflow({ paymentIntent })

    expect(mocks.completeCheckoutFromPaymentIntent).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      id: 'order_existing',
      orderNumber: 1002,
    })
  })

  it('passes through finalization errors unchanged', async () => {
    mocks.completeCheckoutFromPaymentIntent.mockRejectedValue(
      new Error('Checkout session not found for payment intent pi_missing')
    )

    await expect(
      runFinalizePaidOrderWorkflow({
        paymentIntent: {
          id: 'pi_missing',
          amount: 5999,
          currency: 'usd',
          status: 'succeeded',
        },
      })
    ).rejects.toThrow('Checkout session not found for payment intent pi_missing')
  })
})

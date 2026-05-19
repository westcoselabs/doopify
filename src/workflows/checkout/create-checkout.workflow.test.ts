import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createCheckoutPaymentIntent: vi.fn(),
}))

vi.mock('@/server/services/checkout.service', () => ({
  createCheckoutPaymentIntent: mocks.createCheckoutPaymentIntent,
}))

import { createCheckoutWorkflow, runCreateCheckoutWorkflow } from './create-checkout.workflow'

describe('createCheckoutWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defines explicit checkout.create workflow step names', () => {
    expect(createCheckoutWorkflow.id).toBe('checkout.create')
    expect(createCheckoutWorkflow.steps.map((step) => step.id)).toEqual([
      'validate_request_payload',
      'load_live_cart_items',
      'calculate_pricing',
      'resolve_shipping_selection',
      'create_or_update_checkout_session',
      'create_payment_intent',
      'emit_checkout_created_event',
      'build_response',
    ])
  })

  it('delegates execution to createCheckoutPaymentIntent and returns the same payload', async () => {
    mocks.createCheckoutPaymentIntent.mockResolvedValue({
      checkoutSessionId: 'checkout_1',
      paymentIntentId: 'pi_1',
      clientSecret: 'secret_1',
      currency: 'USD',
      subtotal: 50,
      shippingAmount: 9.99,
      taxAmount: 0,
      discountAmount: 0,
      total: 59.99,
      items: [],
    })

    const step = vi.fn()
    const result = await runCreateCheckoutWorkflow(
      {
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          address1: '1 Compute Way',
          city: 'London',
          postalCode: 'N1 1AA',
          country: 'GB',
        },
      },
      { step }
    )

    expect(mocks.createCheckoutPaymentIntent).toHaveBeenCalledTimes(1)
    expect(step).toHaveBeenCalledWith('workflow.checkout_create.start')
    expect(step).toHaveBeenCalledWith('workflow.checkout_create.complete')
    expect(result).toMatchObject({
      checkoutSessionId: 'checkout_1',
      paymentIntentId: 'pi_1',
      clientSecret: 'secret_1',
    })
  })

  it('preserves error behavior from checkout service', async () => {
    mocks.createCheckoutPaymentIntent.mockRejectedValue(new Error('Variant variant_1 could not be found'))

    await expect(
      runCreateCheckoutWorkflow({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          address1: '1 Compute Way',
          city: 'London',
          postalCode: 'N1 1AA',
          country: 'GB',
        },
      })
    ).rejects.toThrow('Variant variant_1 could not be found')
  })
})

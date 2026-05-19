import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runCreateCheckoutWorkflow: vi.fn(),
}))

vi.mock('@/workflows/checkout/create-checkout.workflow', () => ({
  runCreateCheckoutWorkflow: mocks.runCreateCheckoutWorkflow,
}))

import { POST } from './route'

const originalEnv = { ...process.env }

const validPayload = {
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
}

describe('POST /api/checkout/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  it('returns 422 when checkout payload validation fails', async () => {
    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify({
          ...validPayload,
          items: [{ variantId: 'variant_1', quantity: 0 }],
        }),
      })
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Checkout payload is invalid',
    })
    expect(mocks.runCreateCheckoutWorkflow).not.toHaveBeenCalled()
  })

  it('returns 422 when email is missing and does not call workflow', async () => {
    const { email: _email, ...payloadWithoutEmail } = validPayload

    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify(payloadWithoutEmail),
      })
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Checkout payload is invalid',
    })
    expect(mocks.runCreateCheckoutWorkflow).not.toHaveBeenCalled()
  })

  it('returns 400 with the service error for checkout failures', async () => {
    mocks.runCreateCheckoutWorkflow.mockRejectedValue(
      new Error('Only 0 units left for Test Shirt')
    )

    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Only 0 units left for Test Shirt',
    })
  })

  it('passes an optional discount code to checkout creation', async () => {
    mocks.runCreateCheckoutWorkflow.mockResolvedValue({
      checkoutSessionId: 'checkout_1',
      paymentIntentId: 'pi_test',
      clientSecret: 'secret_test',
      currency: 'USD',
      subtotal: 50,
      shippingAmount: 9.99,
      taxAmount: 0,
      discountAmount: 5,
      total: 54.99,
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify({
          ...validPayload,
          discountCode: ' LAUNCH10 ',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.runCreateCheckoutWorkflow).toHaveBeenCalledWith(
      {
        ...validPayload,
        discountCode: 'LAUNCH10',
      },
      expect.objectContaining({
        step: expect.any(Function),
      })
    )
  })

  it('passes selected shipping quote id for server-side revalidation', async () => {
    mocks.runCreateCheckoutWorkflow.mockResolvedValue({
      checkoutSessionId: 'checkout_2',
      paymentIntentId: 'pi_test_2',
      clientSecret: 'secret_test_2',
      currency: 'USD',
      subtotal: 50,
      shippingAmount: 15,
      taxAmount: 0,
      discountAmount: 0,
      total: 65,
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify({
          ...validPayload,
          selectedShippingQuoteId: ' manual:fallback:domestic ',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.runCreateCheckoutWorkflow).toHaveBeenCalledWith(
      {
        ...validPayload,
        selectedShippingQuoteId: 'manual:fallback:domestic',
      },
      expect.objectContaining({
        step: expect.any(Function),
      })
    )
  })

  it('keeps route timing instrumentation active when enabled', async () => {
    process.env.DOOPIFY_ROUTE_TIMING = '1'
    process.env.NODE_ENV = 'test'
    process.env.VERCEL_ENV = 'preview'
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mocks.runCreateCheckoutWorkflow.mockResolvedValue({
      checkoutSessionId: 'checkout_timing',
      paymentIntentId: 'pi_timing',
      clientSecret: 'secret_timing',
      currency: 'USD',
      subtotal: 50,
      shippingAmount: 9.99,
      taxAmount: 0,
      discountAmount: 0,
      total: 59.99,
      items: [],
    })

    const response = await POST(
      new Request('http://localhost/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      })
    )

    expect(response.status).toBe(201)
    expect(logSpy).toHaveBeenCalled()
    const routeTimingCall = logSpy.mock.calls.find(
      (call) =>
        call[0] === '[route-timing]' &&
        typeof call[1] === 'string' &&
        call[1].includes('"route":"POST /api/checkout/create"')
    )
    expect(routeTimingCall).toBeTruthy()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCheckoutShippingQuoteCache } from '@/server/checkout/shipping-quote-cache'

const mocks = vi.hoisted(() => ({
  prisma: {
    productVariant: {
      findMany: vi.fn(),
    },
    checkoutSession: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    discount: {
      findUnique: vi.fn(),
    },
  },
  createStripePaymentIntent: vi.fn(),
  getStoreSettings: vi.fn(),
  getCustomerByEmail: vi.fn(),
  createCustomer: vi.fn(),
  addCustomerAddress: vi.fn(),
  createOrder: vi.fn(),
  getOrderByPaymentIntentId: vi.fn(),
  emitInternalEvent: vi.fn(),
  markCheckoutRecoveredByPaymentIntent: vi.fn(),
  issueDigitalDownloadGrantsForPaidOrder: vi.fn(),
  getShippingRatesForCheckout: vi.fn(),
  getStripeRuntimeConnection: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/stripe', () => ({
  createStripePaymentIntent: mocks.createStripePaymentIntent,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettings: mocks.getStoreSettings,
}))

vi.mock('@/server/services/customer.service', () => ({
  getCustomerByEmail: mocks.getCustomerByEmail,
  createCustomer: mocks.createCustomer,
  addCustomerAddress: mocks.addCustomerAddress,
}))

vi.mock('@/server/services/order.service', () => ({
  createOrder: mocks.createOrder,
  getOrderByPaymentIntentId: mocks.getOrderByPaymentIntentId,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

vi.mock('@/server/services/abandoned-checkout.service', () => ({
  markCheckoutRecoveredByPaymentIntent: mocks.markCheckoutRecoveredByPaymentIntent,
}))

vi.mock('@/server/services/digital-grant-issuance.service', () => ({
  issueDigitalDownloadGrantsForPaidOrder: mocks.issueDigitalDownloadGrantsForPaidOrder,
}))

vi.mock('@/server/shipping/shipping-rate.service', () => ({
  getShippingRatesForCheckout: mocks.getShippingRatesForCheckout,
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeRuntimeConnection: mocks.getStripeRuntimeConnection,
}))

import {
  completeCheckoutFromPaymentIntent,
  createCheckoutPaymentIntent,
  getCheckoutShippingRates,
  getCheckoutStatus,
  markCheckoutSessionFailed,
} from './checkout.service'

const address = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Compute Way',
  city: 'London',
  postalCode: 'N1 1AA',
  country: 'GB',
}

describe('checkout service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCheckoutShippingQuoteCache()
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
    })
    mocks.getStripeRuntimeConnection.mockResolvedValue({
      source: 'env',
      verified: false,
      mode: 'test',
      publishableKey: 'pk_test_checkout',
      secretKey: 'sk_test_checkout',
      webhookSecret: 'whsec_test_checkout',
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })
    mocks.getCustomerByEmail.mockResolvedValue(null)
    mocks.issueDigitalDownloadGrantsForPaidOrder.mockResolvedValue({
      created: 0,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    })
    mocks.getShippingRatesForCheckout.mockImplementation(async ({ shippingAddress }) => [
      {
        id: shippingAddress?.country === 'CA' ? 'manual:fallback:international' : 'manual:fallback:domestic',
        source: 'MANUAL',
        displayName: shippingAddress?.country === 'CA' ? 'International shipping' : 'Domestic shipping',
        amountCents: shippingAddress?.country === 'CA' ? 1999 : 999,
        currency: 'USD',
      },
    ])
  })

  it('creates a Stripe payment intent from server-owned live pricing', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_test',
      client_secret: 'secret_test',
      amount: 5999,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_1',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: ' ADA@EXAMPLE.COM ',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith({
      amount: 5999,
      currency: 'USD',
      email: 'ada@example.com',
      metadata: {
        checkoutEmail: 'ada@example.com',
      },
      secretKey: 'sk_test_checkout',
    })
    expect(mocks.prisma.checkoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentIntentId: 'pi_test',
        email: 'ada@example.com',
        currency: 'USD',
        subtotalCents: 5000,
        shippingAmountCents: 999,
        taxAmountCents: 0,
        discountAmountCents: 0,
        totalCents: 5999,
      }),
    })
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('checkout.created', {
      checkoutSessionId: 'checkout_1',
      paymentIntentId: 'pi_test',
      email: 'ada@example.com',
      total: 59.99,
      currency: 'USD',
    })
    expect(checkout).toMatchObject({
      checkoutSessionId: 'checkout_1',
      paymentIntentId: 'pi_test',
      clientSecret: 'secret_test',
      subtotal: 50,
      shippingAmount: 9.99,
      total: 59.99,
      items: [
        expect.objectContaining({
          productId: 'product_1',
          variantId: 'variant_1',
          price: 25,
          quantity: 2,
        }),
      ],
    })
  })

  it('requires shipping address for physical carts', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_physical',
        productId: 'product_physical',
        title: 'Default',
        sku: 'SKU-P',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_physical',
          title: 'Physical Product',
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_physical', quantity: 1 }],
      })
    ).rejects.toThrow('Shipping address is required for physical products.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('creates digital-only checkout without shipping address and uses zero shipping', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_digital',
        productId: 'product_digital',
        title: 'Default',
        sku: 'SKU-D',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_digital',
          title: 'Digital Product',
          fulfillmentType: 'DIGITAL',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_digital_only',
      client_secret: 'secret_digital_only',
      amount: 2500,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_digital_only',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_digital', quantity: 1 }],
    })

    expect(mocks.getShippingRatesForCheckout).not.toHaveBeenCalled()
    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
      })
    )
    expect(mocks.prisma.checkoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shippingAmountCents: 0,
        totalCents: 2500,
      }),
    })
    expect(checkout).toMatchObject({
      shippingAmount: 0,
      shippingAmountCents: 0,
      total: 25,
      totalCents: 2500,
      selectedShippingRate: {
        id: 'digital:no-shipping',
      },
    })
  })

  it('rejects mixed physical and digital carts', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_physical',
        productId: 'product_physical',
        title: 'Default',
        sku: 'SKU-P',
        price: 20,
        inventory: 5,
        product: {
          id: 'product_physical',
          title: 'Physical Product',
          fulfillmentType: 'PHYSICAL',
        },
      },
      {
        id: 'variant_digital',
        productId: 'product_digital',
        title: 'Default',
        sku: 'SKU-D',
        price: 10,
        inventory: 5,
        product: {
          id: 'product_digital',
          title: 'Digital Product',
          fulfillmentType: 'DIGITAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [
          { variantId: 'variant_physical', quantity: 1 },
          { variantId: 'variant_digital', quantity: 1 },
        ],
        shippingAddress: address,
      })
    ).rejects.toThrow('Mixed physical and digital carts are not supported yet.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('defaults unknown fulfillment type to physical safety policy', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_unknown',
        productId: 'product_unknown',
        title: 'Default',
        sku: 'SKU-U',
        price: 20,
        inventory: 5,
        product: {
          id: 'product_unknown',
          title: 'Unknown Product',
          fulfillmentType: 'UNKNOWN_TYPE',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_unknown', quantity: 1 }],
      })
    ).rejects.toThrow('Shipping address is required for physical products.')
  })

  it('uses verified DB Stripe runtime secret key when available', async () => {
    mocks.getStripeRuntimeConnection.mockResolvedValueOnce({
      source: 'db',
      verified: true,
      mode: 'live',
      publishableKey: 'pk_live_checkout',
      secretKey: 'sk_live_db_checkout',
      webhookSecret: 'whsec_live_checkout',
      accountId: 'acct_live_checkout',
      chargesEnabled: true,
      payoutsEnabled: true,
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_db_runtime',
      client_secret: 'secret_db_runtime',
      amount: 5999,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_db_runtime',
    })

    await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        secretKey: 'sk_live_db_checkout',
      })
    )
  })

  it('uses env fallback Stripe runtime secret key when no verified DB runtime exists', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_env_runtime',
      client_secret: 'secret_env_runtime',
      amount: 5999,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_env_runtime',
    })

    await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        secretKey: 'sk_test_checkout',
      })
    )
  })

  it('returns setup error when Stripe runtime has no secret key', async () => {
    mocks.getStripeRuntimeConnection.mockResolvedValueOnce({
      source: 'none',
      verified: false,
      mode: null,
      publishableKey: null,
      secretKey: null,
      webhookSecret: null,
      accountId: null,
      chargesEnabled: null,
      payoutsEnabled: null,
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 2 }],
        shippingAddress: address,
      })
    ).rejects.toThrow(
      'Stripe checkout is not configured. Save and verify Stripe credentials in Settings -> Payments or set STRIPE_SECRET_KEY.'
    )

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('includes manual tax settings in stripe amount calculation', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 0,
      taxEnabled: true,
      taxStrategy: 'MANUAL',
      defaultTaxRateBps: 1000,
      taxShipping: true,
      pricesIncludeTax: false,
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValue([
      {
        id: 'manual:free',
        source: 'MANUAL',
        displayName: 'Free shipping',
        amountCents: 0,
        currency: 'USD',
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_tax_manual',
      client_secret: 'secret_tax_manual',
      amount: 5500,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_tax_manual',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith({
      amount: 5500,
      currency: 'USD',
      email: 'ada@example.com',
      metadata: {
        checkoutEmail: 'ada@example.com',
      },
      secretKey: 'sk_test_checkout',
    })
    expect(checkout).toMatchObject({
      shippingAmountCents: 0,
      taxAmountCents: 500,
      totalCents: 5500,
    })
  })

  it('uses destination shipping zone and tax rules for checkout totals', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 100000,
      country: 'US',
      domesticTaxRate: 0.07,
      internationalTaxRate: 0.05,
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 20,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_zone_tax',
      client_secret: 'secret_zone_tax',
      amount: 3999,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_zone_tax',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: {
        ...address,
        country: 'CA',
        province: 'ON',
      },
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith({
      amount: 3999,
      currency: 'USD',
      email: 'ada@example.com',
      metadata: {
        checkoutEmail: 'ada@example.com',
      },
      secretKey: 'sk_test_checkout',
    })
    expect(checkout).toMatchObject({
      checkoutSessionId: 'checkout_zone_tax',
      subtotal: 20,
      shippingAmount: 19.99,
      taxAmount: 0,
      total: 39.99,
    })
  })

  it('applies an active discount code through server-owned pricing', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.prisma.discount.findUnique.mockResolvedValue({
      id: 'discount_1',
      code: 'LAUNCH10',
      title: 'Launch 10',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: null,
      usageLimit: null,
      usageCount: 0,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    })
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_discount',
      client_secret: 'secret_discount',
      amount: 5499,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_discount',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
      discountCode: ' launch10 ',
    })

    expect(mocks.prisma.discount.findUnique).toHaveBeenCalledWith({
      where: { code: 'LAUNCH10' },
    })
    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith({
      amount: 5499,
      currency: 'USD',
      email: 'ada@example.com',
      metadata: {
        checkoutEmail: 'ada@example.com',
      },
      secretKey: 'sk_test_checkout',
    })
    expect(mocks.prisma.checkoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentIntentId: 'pi_discount',
        subtotalCents: 5000,
        shippingAmountCents: 999,
        taxAmountCents: 0,
        discountAmountCents: 500,
        totalCents: 5499,
        payload: expect.objectContaining({
          discountApplications: [
            {
              discountId: 'discount_1',
              code: 'LAUNCH10',
              title: 'Launch 10',
              method: 'PERCENTAGE',
              amountCents: 500,
            },
          ],
        }),
      }),
    })
    expect(checkout).toMatchObject({
      checkoutSessionId: 'checkout_discount',
      subtotal: 50,
      shippingAmount: 9.99,
      discountAmount: 5,
      total: 54.99,
      appliedDiscount: {
        discountId: 'discount_1',
        code: 'LAUNCH10',
        amount: 5,
      },
    })
  })

  it('rejects missing discount codes before creating a Stripe payment intent', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.prisma.discount.findUnique.mockResolvedValue(null)

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 2 }],
        shippingAddress: address,
        discountCode: 'missing',
      })
    ).rejects.toThrow('Discount code not found')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
    expect(mocks.prisma.checkoutSession.create).not.toHaveBeenCalled()
  })

  it('returns the existing paid order for duplicate payment-intent completion', async () => {
    const existingOrder = {
      id: 'order_1',
      orderNumber: 1001,
    }
    mocks.getOrderByPaymentIntentId.mockResolvedValue(existingOrder)

    const order = await completeCheckoutFromPaymentIntent({
      id: 'pi_duplicate',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
    })

    expect(order).toBe(existingOrder)
    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: { paymentIntentId: 'pi_duplicate' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date), failureReason: null },
    })
    expect(mocks.issueDigitalDownloadGrantsForPaidOrder).toHaveBeenCalledWith({
      orderId: 'order_1',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('stores selected shipping method snapshot fields when finalizing an order', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValue(null)
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue({
      id: 'checkout_shipping_snapshot',
      paymentIntentId: 'pi_shipping_snapshot',
      email: 'ada@example.com',
      currency: 'USD',
      taxAmountCents: 0,
      shippingAmountCents: 900,
      discountAmountCents: 0,
      payload: {
        email: 'ada@example.com',
        items: [
          {
            productId: 'product_1',
            variantId: 'variant_1',
            title: 'Test Shirt',
            priceCents: 5000,
            quantity: 1,
          },
        ],
        shippingAddress: address,
        billingAddress: address,
        selectedShippingRate: {
          id: 'manual-rate:rate_1',
          source: 'MANUAL',
          rateType: 'FLAT',
          displayName: 'Manual economy',
          amountCents: 900,
          currency: 'USD',
          estimatedDeliveryText: '3-5 business days',
        },
      },
    })
    mocks.getCustomerByEmail.mockResolvedValue({
      id: 'customer_1',
      email: 'ada@example.com',
      addresses: [{}],
    })
    mocks.createOrder.mockResolvedValue({
      id: 'order_shipping_snapshot',
      orderNumber: 1002,
    })
    mocks.prisma.checkoutSession.update.mockResolvedValue({
      id: 'checkout_shipping_snapshot',
    })

    await completeCheckoutFromPaymentIntent({
      id: 'pi_shipping_snapshot',
      amount: 5900,
      currency: 'usd',
      status: 'succeeded',
    })

    expect(mocks.issueDigitalDownloadGrantsForPaidOrder).toHaveBeenCalledWith({
      orderId: 'order_shipping_snapshot',
    })
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingMethodName: 'Manual economy',
        shippingRateType: 'FLAT',
        shippingProvider: null,
        shippingProviderRateId: null,
        estimatedDeliveryText: '3-5 business days',
      })
    )
  })

  it('marks pending checkout sessions as failed and emits an internal event', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValue(null)
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue({
      id: 'checkout_1',
      email: 'ada@example.com',
      status: 'PENDING',
    })
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.checkoutSession.findUniqueOrThrow.mockResolvedValue({
      id: 'checkout_1',
      email: 'ada@example.com',
      status: 'FAILED',
      failureReason: 'Card declined',
    })

    const updated = await markCheckoutSessionFailed({
      paymentIntentId: 'pi_failed',
      reason: 'Card declined',
    })

    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'checkout_1',
        status: 'PENDING',
      },
      data: {
        status: 'FAILED',
        failureReason: 'Card declined',
      },
    })
    expect(mocks.emitInternalEvent).toHaveBeenCalledWith('checkout.failed', {
      paymentIntentId: 'pi_failed',
      email: 'ada@example.com',
      reason: 'Card declined',
    })
    expect(updated).toMatchObject({
      id: 'checkout_1',
      status: 'FAILED',
    })
  })

  it('does not downgrade completed checkouts when failure webhooks arrive late', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValue(null)
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue({
      id: 'checkout_1',
      email: 'ada@example.com',
      status: 'COMPLETED',
      failureReason: null,
    })
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.checkoutSession.findUnique.mockResolvedValueOnce({
      id: 'checkout_1',
      email: 'ada@example.com',
      status: 'COMPLETED',
      failureReason: null,
    })
    mocks.prisma.checkoutSession.findUnique.mockResolvedValueOnce({
      id: 'checkout_1',
      email: 'ada@example.com',
      status: 'COMPLETED',
      failureReason: null,
    })

    const checkout = await markCheckoutSessionFailed({
      paymentIntentId: 'pi_completed',
      reason: 'Card declined',
    })

    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'checkout_1',
        status: 'PENDING',
      },
      data: {
        status: 'FAILED',
        failureReason: 'Card declined',
      },
    })
    expect(mocks.emitInternalEvent).not.toHaveBeenCalledWith(
      'checkout.failed',
      expect.objectContaining({
        paymentIntentId: 'pi_completed',
      })
    )
    expect(checkout).toMatchObject({
      status: 'COMPLETED',
      failureReason: null,
    })
  })

  it('ignores failure webhook downgrades when a paid order already exists', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValue({
      id: 'order_1',
      orderNumber: 1001,
    })

    const result = await markCheckoutSessionFailed({
      paymentIntentId: 'pi_paid',
      reason: 'Card declined',
    })

    expect(result).toBeNull()
    expect(mocks.prisma.checkoutSession.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.checkoutSession.updateMany).not.toHaveBeenCalled()
    expect(mocks.emitInternalEvent).not.toHaveBeenCalled()
  })

  it('fails checkout creation when requested quantity exceeds live inventory', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 1,
        continueSellingWhenOutOfStock: false,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'STANDARD',
          presaleStartsAt: null,
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: null,
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 2 }],
        shippingAddress: address,
      })
    ).rejects.toThrow('Only 1 units left for this variant.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
    expect(mocks.prisma.checkoutSession.create).not.toHaveBeenCalled()
  })

  it('rejects coming-soon products before payment intent creation', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 10,
        continueSellingWhenOutOfStock: false,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'COMING_SOON',
          presaleStartsAt: null,
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: 'Launching soon',
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: address,
      })
    ).rejects.toThrow('Launching soon')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('rejects presale products before presale starts and treats them as coming soon', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 10,
        continueSellingWhenOutOfStock: true,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'PRESALE',
          presaleStartsAt: new Date(Date.now() + 60_000),
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: 'Presale opens Friday',
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: address,
      })
    ).rejects.toThrow('Presale opens Friday')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('allows presale checkout when variant permits continue selling at zero inventory', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 0,
        continueSellingWhenOutOfStock: true,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'PRESALE',
          presaleStartsAt: null,
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: null,
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_presale_continue',
      client_secret: 'secret_presale_continue',
      amount: 3499,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_presale_continue',
    })

    await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalled()
  })

  it('blocks checkout for zero-inventory variants when continue selling is disabled', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 0,
        continueSellingWhenOutOfStock: false,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'STANDARD',
          presaleStartsAt: null,
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: null,
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: address,
      })
    ).rejects.toThrow('Only 0 units left for this variant.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('allows checkout for zero-inventory variants when continue selling is enabled', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 0,
        continueSellingWhenOutOfStock: true,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
          salesMode: 'STANDARD',
          presaleStartsAt: null,
          presaleEndsAt: null,
          availableForPurchaseAt: null,
          availabilityMessage: null,
          fulfillmentType: 'PHYSICAL',
        },
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_backorder_standard',
      client_secret: 'secret_backorder_standard',
      amount: 3499,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_backorder_standard',
    })

    await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: address,
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalled()
    expect(mocks.prisma.checkoutSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentIntentId: 'pi_backorder_standard',
        }),
      })
    )
  })

  it('revalidates selected shipping quote before creating stripe amount', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValue([
      {
        id: 'manual:cheap',
        source: 'MANUAL',
        displayName: 'Economy',
        amountCents: 900,
        currency: 'USD',
      },
      {
        id: 'manual:premium',
        source: 'MANUAL',
        displayName: 'Premium',
        amountCents: 3000,
        currency: 'USD',
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_selected_shipping',
      client_secret: 'secret_selected_shipping',
      amount: 8000,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_selected_shipping',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
      selectedShippingQuoteId: 'manual:premium',
    })

    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith({
      amount: 8000,
      currency: 'USD',
      email: 'ada@example.com',
      metadata: {
        checkoutEmail: 'ada@example.com',
      },
      secretKey: 'sk_test_checkout',
    })
    expect(mocks.prisma.checkoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shippingAmountCents: 3000,
        totalCents: 8000,
      }),
    })
    expect(checkout).toMatchObject({
      shippingAmountCents: 3000,
      totalCents: 8000,
      selectedShippingRate: {
        id: 'manual:premium',
        amountCents: 3000,
      },
    })
  })

  it('returns stable quote selection ids for live rates and accepts them during checkout creation', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
      shippingMode: 'LIVE_RATES',
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValueOnce([
      {
        id: 'shippo_rate_original',
        source: 'SHIPPO',
        carrier: 'USPS',
        service: 'Priority',
        displayName: 'USPS Priority',
        amountCents: 1900,
        currency: 'USD',
        providerRateId: 'shippo_rate_original',
        providerShipmentId: 'shippo_shipment_1',
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_live_quote',
      client_secret: 'secret_live_quote',
      amount: 6900,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_live_quote',
    })

    const shippingRates = await getCheckoutShippingRates({
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
    })
    const selectedShippingQuoteId = shippingRates.quotes[0]?.selectedShippingQuoteId

    expect(selectedShippingQuoteId).toMatch(/^shipping-quote_/)

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
      selectedShippingQuoteId,
    })

    expect(mocks.getShippingRatesForCheckout).toHaveBeenCalledTimes(1)
    expect(mocks.createStripePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 6900,
      })
    )
    expect(checkout.selectedShippingRate).toMatchObject({
      id: selectedShippingQuoteId,
      providerRateId: 'shippo_rate_original',
      providerShipmentId: 'shippo_shipment_1',
      amountCents: 1900,
    })
  })

  it('rejects checkout create when a live quote selection id is expired or missing', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
      shippingMode: 'LIVE_RATES',
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValueOnce([
      {
        id: 'easypost_rate_original',
        source: 'EASYPOST',
        carrier: 'UPS',
        service: 'Ground',
        displayName: 'UPS Ground',
        amountCents: 1100,
        currency: 'USD',
        providerRateId: 'easypost_rate_original',
        providerShipmentId: 'easypost_shipment_1',
      },
    ])

    const shippingRates = await getCheckoutShippingRates({
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: address,
    })
    const selectedShippingQuoteId = shippingRates.quotes[0]?.selectedShippingQuoteId

    clearCheckoutShippingQuoteCache()

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: address,
        selectedShippingQuoteId,
      })
    ).rejects.toThrow('Shipping rates expired. Please refresh shipping options and select a rate again.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('rejects checkout create when quote cart fingerprint no longer matches', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
      shippingMode: 'LIVE_RATES',
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 6,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValueOnce([
      {
        id: 'shippo_rate_cart',
        source: 'SHIPPO',
        displayName: 'Shippo Rate',
        amountCents: 1200,
        currency: 'USD',
        providerRateId: 'shippo_rate_cart',
        providerShipmentId: 'shippo_shipment_cart',
      },
    ])

    const shippingRates = await getCheckoutShippingRates({
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: address,
    })
    const selectedShippingQuoteId = shippingRates.quotes[0]?.selectedShippingQuoteId

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 2 }],
        shippingAddress: address,
        selectedShippingQuoteId,
      })
    ).rejects.toThrow('Shipping rates expired. Please refresh shipping options and select a rate again.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('rejects checkout create when quote destination fingerprint no longer matches', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
      shippingMode: 'LIVE_RATES',
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 6,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValueOnce([
      {
        id: 'shippo_rate_address',
        source: 'SHIPPO',
        displayName: 'Shippo Rate',
        amountCents: 1200,
        currency: 'USD',
        providerRateId: 'shippo_rate_address',
        providerShipmentId: 'shippo_shipment_address',
      },
    ])

    const shippingRates = await getCheckoutShippingRates({
      items: [{ variantId: 'variant_1', quantity: 1 }],
      shippingAddress: address,
    })
    const selectedShippingQuoteId = shippingRates.quotes[0]?.selectedShippingQuoteId

    await expect(
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: 'variant_1', quantity: 1 }],
        shippingAddress: {
          ...address,
          postalCode: '90210',
        },
        selectedShippingQuoteId,
      })
    ).rejects.toThrow('Shipping rates expired. Please refresh shipping options and select a rate again.')

    expect(mocks.createStripePaymentIntent).not.toHaveBeenCalled()
  })

  it('keeps manual fallback selection behavior in HYBRID mode', async () => {
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
      shippingMode: 'HYBRID',
    })
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        sku: 'SKU-1',
        price: 25,
        inventory: 3,
        product: {
          id: 'product_1',
          title: 'Test Shirt',
        },
      },
    ])
    mocks.getShippingRatesForCheckout.mockResolvedValueOnce([
      {
        id: 'fallback:manual-hybrid',
        source: 'MANUAL',
        rateType: 'FALLBACK',
        displayName: 'Manual fallback',
        amountCents: 1600,
        currency: 'USD',
      },
    ])
    mocks.createStripePaymentIntent.mockResolvedValue({
      id: 'pi_hybrid_manual',
      client_secret: 'secret_hybrid_manual',
      amount: 6600,
      currency: 'usd',
      status: 'requires_payment_method',
    })
    mocks.prisma.checkoutSession.create.mockResolvedValue({
      id: 'checkout_hybrid_manual',
    })

    const checkout = await createCheckoutPaymentIntent({
      email: 'ada@example.com',
      items: [{ variantId: 'variant_1', quantity: 2 }],
      shippingAddress: address,
      selectedShippingQuoteId: 'fallback:manual-hybrid',
    })

    expect(mocks.getShippingRatesForCheckout).toHaveBeenCalledTimes(1)
    expect(checkout).toMatchObject({
      shippingAmountCents: 1600,
      totalCents: 6600,
      selectedShippingRate: {
        id: 'fallback:manual-hybrid',
        source: 'MANUAL',
      },
    })
  })

  it('returns confirmed status with order summary fields when a paid order exists', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValueOnce({
      id: 'order_1',
      orderNumber: 1001,
      totalCents: 5499,
      currency: 'USD',
      estimatedDeliveryText: '3-5 business days',
    })

    const status = await getCheckoutStatus('pi_paid_status')

    expect(status).toEqual({
      status: 'paid',
      orderNumber: 1001,
      total: 54.99,
      currency: 'USD',
      estimatedDeliveryText: '3-5 business days',
      checkoutStatus: 'COMPLETED',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('returns processing status from checkout session and does not create orders', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValueOnce(null)
    mocks.prisma.checkoutSession.findUnique.mockResolvedValueOnce({
      status: 'PENDING',
      failureReason: null,
    })

    const status = await getCheckoutStatus('pi_processing_status')

    expect(status).toEqual({
      status: 'processing',
      checkoutStatus: 'PENDING',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('returns failed status with sanitized customer-safe reason path and no order creation', async () => {
    mocks.getOrderByPaymentIntentId.mockResolvedValueOnce(null)
    mocks.prisma.checkoutSession.findUnique.mockResolvedValueOnce({
      status: 'FAILED',
      failureReason: 'Card declined',
    })

    const status = await getCheckoutStatus('pi_failed_status')

    expect(status).toEqual({
      status: 'failed',
      reason: 'Card declined',
      checkoutStatus: 'FAILED',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })
})

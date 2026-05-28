// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

const mocks = vi.hoisted(() => ({
  createStripePaymentIntent: vi.fn(),
}))

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')
  return {
    ...actual,
    createStripePaymentIntent: mocks.createStripePaymentIntent,
  }
})

import {
  completeCheckoutFromPaymentIntent,
  createCheckoutPaymentIntent,
} from './checkout.service'
import { parseStripeWebhookEventPayload, processStripeWebhookEvent } from './stripe-webhook.service'
import {
  claimWebhookDeliveryForRetry,
  getDueWebhookDeliveriesForRetry,
  markWebhookDeliveryFailed,
  markWebhookDeliveryProcessed,
  recordWebhookDeliveryAttempt,
  storeVerifiedWebhookPayload,
} from './webhook-delivery.service'
import { integrationRegistry } from '@/server/integrations/registry'

const runIntegration =
  process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
    ? describe
    : describe.skip
const originalResendApiKey = process.env.RESEND_API_KEY

function createBarrier(parties: number) {
  let waiting = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  return async () => {
    waiting += 1
    if (waiting === parties) {
      release()
    }
    await gate
  }
}

const address = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  address1: '1 Compute Way',
  city: 'London',
  postalCode: 'N1 1AA',
  country: 'GB',
}

async function cleanTestData() {
  await prisma.analyticsEvent.deleteMany()
  await prisma.webhookDelivery.deleteMany()
  await prisma.digitalDownloadEvent.deleteMany()
  await prisma.digitalDownloadGrant.deleteMany()
  await prisma.productDigitalAsset.deleteMany()
  await prisma.digitalAsset.deleteMany()
  await prisma.shippingRate.deleteMany()
  await prisma.shippingZone.deleteMany()
  await prisma.taxRule.deleteMany()
  await prisma.discountApplication.deleteMany()
  await prisma.discount.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.return.deleteMany()
  await prisma.fulfillmentItem.deleteMany()
  await prisma.fulfillment.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.orderEvent.deleteMany()
  await prisma.orderAddress.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.checkoutSession.deleteMany()
  await prisma.customerAddress.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.collectionProduct.deleteMany()
  await prisma.collection.deleteMany()
  await prisma.productMedia.deleteMany()
  await prisma.mediaAsset.deleteMany()
  await prisma.productOptionValue.deleteMany()
  await prisma.productOption.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
  await prisma.store.deleteMany()
}

async function seedVariant(input: {
  paymentIntentId: string
  inventory: number
  price?: number
}) {
  await prisma.store.create({
    data: {
      name: 'Integration Store',
      email: 'orders@example.com',
      currency: 'USD',
      shippingThresholdCents: 7500,
    },
  })

  const product = await prisma.product.create({
    data: {
      title: 'Integration Shirt',
      handle: `integration-variant-${input.paymentIntentId}`,
      status: 'ACTIVE',
      variants: {
        create: {
          title: 'Default',
          sku: `SKU-${input.paymentIntentId}`,
          priceCents: Math.round((input.price ?? 25) * 100),
          inventory: input.inventory,
        },
      },
    },
    include: {
      variants: true,
    },
  })

  return {
    product,
    variant: product.variants[0],
  }
}

async function createCheckoutSession(input: {
  paymentIntentId: string
  email: string
  productId: string
  variantId: string
  title: string
  variantTitle: string
  sku: string
  priceCents: number
  quantity: number
  discountApplication?: {
    discountId: string
    code?: string | null
    title: string
    method: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y'
    amountCents: number
  }
  shippingAmountCents?: number
  includeShippingAddress?: boolean
  itemFulfillmentType?: 'PHYSICAL' | 'DIGITAL'
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
}) {
  const subtotalCents = input.priceCents * input.quantity
  const shippingAmountCents =
    input.shippingAmountCents ?? (subtotalCents >= 7500 ? 0 : 999)
  const discountAmountCents = input.discountApplication?.amountCents ?? 0
  const totalCents = subtotalCents + shippingAmountCents - discountAmountCents

  const payload = {
    email: input.email,
    ...(input.includeShippingAddress === false
      ? {}
      : {
          shippingAddress: address,
          billingAddress: address,
        }),
    items: [
      {
        productId: input.productId,
        variantId: input.variantId,
        title: input.title,
        variantTitle: input.variantTitle,
        sku: input.sku,
        priceCents: input.priceCents,
        quantity: input.quantity,
        fulfillmentType: input.itemFulfillmentType,
      },
    ],
    ...(input.discountApplication
      ? {
          discountApplications: [input.discountApplication],
        }
      : {}),
  }

  return prisma.checkoutSession.create({
    data: {
      paymentIntentId: input.paymentIntentId,
      email: input.email,
      currency: 'USD',
      status: input.status ?? 'PENDING',
      subtotalCents,
      shippingAmountCents,
      taxAmountCents: 0,
      discountAmountCents,
      totalCents,
      payload,
    },
  })
}

async function seedCheckout({
  paymentIntentId,
  inventory,
  quantity,
  discountCode,
}: {
  paymentIntentId: string
  inventory: number
  quantity: number
  discountCode?: string
}) {
  await prisma.store.create({
    data: {
      name: 'Integration Store',
      email: 'orders@example.com',
      currency: 'USD',
      shippingThresholdCents: 7500,
    },
  })

  const product = await prisma.product.create({
    data: {
      title: 'Integration Shirt',
      handle: `integration-shirt-${paymentIntentId}`,
      status: 'ACTIVE',
      variants: {
        create: {
          title: 'Default',
          sku: `SKU-${paymentIntentId}`,
          priceCents: 2500,
          inventory,
        },
      },
    },
    include: {
      variants: true,
    },
  })

  const variant = product.variants[0]
  const subtotalCents = 2500 * quantity
  const shippingAmountCents = subtotalCents >= 7500 ? 0 : 999
  const discount = discountCode
    ? await prisma.discount.create({
        data: {
          code: discountCode,
          title: 'Launch 10',
          type: 'CODE',
          method: 'PERCENTAGE',
          value: 10,
          status: 'ACTIVE',
        },
      })
    : null
  const discountAmountCents = discount ? Math.round(subtotalCents * 0.1) : 0
  const totalCents = subtotalCents + shippingAmountCents - discountAmountCents

  await prisma.checkoutSession.create({
    data: {
      paymentIntentId,
      email: 'ada@example.com',
      currency: 'USD',
      subtotalCents,
      shippingAmountCents,
      taxAmountCents: 0,
      discountAmountCents,
      totalCents,
      payload: {
        email: 'ada@example.com',
        shippingAddress: address,
        billingAddress: address,
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            title: product.title,
            variantTitle: variant.title,
            sku: variant.sku,
            priceCents: variant.priceCents,
            quantity,
          },
        ],
        ...(discount
          ? {
              discountApplications: [
                {
                  discountId: discount.id,
                  code: discount.code,
                  title: discount.title,
                  method: discount.method,
                  amountCents: discountAmountCents,
                },
              ],
            }
          : {}),
      },
    },
  })

  return {
    product,
    variant,
    discount,
    discountAmountCents,
    totalCents,
  }
}

async function seedDigitalCheckout({
  paymentIntentId,
  quantity,
}: {
  paymentIntentId: string
  quantity: number
}) {
  await prisma.store.create({
    data: {
      id: 'store_digital',
      name: 'Digital Store',
      email: 'digital@example.com',
      currency: 'USD',
      shippingThresholdCents: 7500,
    },
  })

  const product = await prisma.product.create({
    data: {
      title: 'Digital Guide',
      handle: `digital-guide-${paymentIntentId}`,
      status: 'ACTIVE',
      fulfillmentType: 'DIGITAL',
      variants: {
        create: {
          title: 'Default',
          sku: `SKU-DIGITAL-${paymentIntentId}`,
          priceCents: 2000,
          inventory: 10,
        },
      },
    },
    include: {
      variants: true,
    },
  })

  const digitalAsset = await prisma.digitalAsset.create({
    data: {
      storeId: 'store_digital',
      title: 'Digital Guide PDF',
      fileName: 'guide.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
      storageProvider: 's3',
      storageKey: `private/digital/${paymentIntentId}/guide.pdf`,
      checksumSha256: 'abc123',
    },
  })

  await prisma.productDigitalAsset.create({
    data: {
      productId: product.id,
      digitalAssetId: digitalAsset.id,
      sortOrder: 0,
    },
  })

  const variant = product.variants[0]
  await createCheckoutSession({
    paymentIntentId,
    email: 'digital-buyer@example.com',
    productId: product.id,
    variantId: variant.id,
    title: product.title,
    variantTitle: variant.title,
    sku: variant.sku ?? 'SKU-DIGITAL',
    priceCents: variant.priceCents,
    quantity,
    shippingAmountCents: 0,
    includeShippingAddress: false,
    itemFulfillmentType: 'DIGITAL',
  })

  return {
    product,
    variant,
    digitalAsset,
  }
}

runIntegration('checkout service integration', () => {
  beforeEach(async () => {
    process.env.RESEND_API_KEY = ''
    await cleanTestData()
    let paymentIntentOrdinal = 0
    mocks.createStripePaymentIntent.mockReset()
    mocks.createStripePaymentIntent.mockImplementation(async (input: { amount: number; currency: string }) => {
      paymentIntentOrdinal += 1
      return {
        id: `pi_mock_${paymentIntentOrdinal}`,
        client_secret: `secret_mock_${paymentIntentOrdinal}`,
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        status: 'requires_payment_method',
      }
    })
  }, 60_000)

  afterAll(async () => {
    await cleanTestData()
    if (originalResendApiKey == null) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey
    }
    await prisma.$disconnect()
  }, 60_000)

  it('creates a paid order and decrements inventory after verified payment success', async () => {
    const { variant } = await seedCheckout({
      paymentIntentId: 'pi_integration_success',
      inventory: 5,
      quantity: 2,
    })

    const order = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_success',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
      latest_charge: 'ch_integration_success',
    })

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const checkoutSession = await prisma.checkoutSession.findUniqueOrThrow({
      where: { paymentIntentId: 'pi_integration_success' },
    })
    const digitalGrantCount = await prisma.digitalDownloadGrant.count({
      where: { orderId: order.id },
    })

    expect(order.paymentStatus).toBe('PAID')
    expect(order.items).toHaveLength(1)
    expect(order.payments).toHaveLength(1)
    expect(updatedVariant.inventory).toBe(3)
    expect(digitalGrantCount).toBe(0)
    expect(checkoutSession.status).toBe('COMPLETED')
    expect(checkoutSession.completedAt).toBeInstanceOf(Date)
  })

  it('handles duplicate payment-intent completion without duplicating orders or inventory decrements', async () => {
    const { variant } = await seedCheckout({
      paymentIntentId: 'pi_integration_duplicate',
      inventory: 5,
      quantity: 2,
    })

    const firstOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_duplicate',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
    })
    const secondOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_duplicate',
      amount: 5999,
      currency: 'usd',
      status: 'succeeded',
    })

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const orderCount = await prisma.order.count()
    const paymentCount = await prisma.payment.count({
      where: { stripePaymentIntentId: 'pi_integration_duplicate' },
    })

    expect(secondOrder.id).toBe(firstOrder.id)
    expect(orderCount).toBe(1)
    expect(paymentCount).toBe(1)
    expect(updatedVariant.inventory).toBe(3)
  })

  it('creates digital download grants for paid digital-only orders and remains idempotent on duplicate finalization', async () => {
    const { digitalAsset, product } = await seedDigitalCheckout({
      paymentIntentId: 'pi_integration_digital_grants',
      quantity: 1,
    })

    const firstOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_digital_grants',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
    })
    const secondOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_digital_grants',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
    })

    const grants = await prisma.digitalDownloadGrant.findMany({
      where: { orderId: firstOrder.id },
      select: {
        id: true,
        orderItemId: true,
        digitalAssetId: true,
        productId: true,
        downloadLimit: true,
        downloadCount: true,
        expiresAt: true,
        tokenHash: true,
      },
    })

    expect(secondOrder.id).toBe(firstOrder.id)
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({
      productId: product.id,
      digitalAssetId: digitalAsset.id,
      downloadLimit: 5,
      downloadCount: 0,
    })
    expect(grants[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(grants[0].tokenHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not fail paid finalization when a digital product has no linked assets', async () => {
    await prisma.store.create({
      data: {
        id: 'store_missing_assets',
        name: 'Missing Asset Store',
        email: 'missing-assets@example.com',
        currency: 'USD',
        shippingThresholdCents: 7500,
      },
    })

    const product = await prisma.product.create({
      data: {
        title: 'Digital Without Asset',
        handle: 'digital-without-asset',
        status: 'ACTIVE',
        fulfillmentType: 'DIGITAL',
        variants: {
          create: {
            title: 'Default',
            sku: 'SKU-DIGITAL-MISSING',
            priceCents: 1500,
            inventory: 10,
          },
        },
      },
      include: { variants: true },
    })

    const variant = product.variants[0]
    await createCheckoutSession({
      paymentIntentId: 'pi_integration_digital_missing_assets',
      email: 'digital-missing@example.com',
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku ?? 'SKU-DIGITAL-MISSING',
      priceCents: variant.priceCents,
      quantity: 1,
      shippingAmountCents: 0,
      includeShippingAddress: false,
      itemFulfillmentType: 'DIGITAL',
    })

    const order = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_digital_missing_assets',
      amount: 1500,
      currency: 'usd',
      status: 'succeeded',
    })

    expect(order.paymentStatus).toBe('PAID')
    expect(await prisma.order.count()).toBe(1)
    expect(
      await prisma.digitalDownloadGrant.count({
        where: { orderId: order.id },
      })
    ).toBe(0)
  })

  it('keeps inventory idempotent during competing duplicate payment-intent completions', async () => {
    const { variant } = await seedCheckout({
      paymentIntentId: 'pi_integration_race',
      inventory: 3,
      quantity: 2,
    })

    const results = await Promise.all([
      completeCheckoutFromPaymentIntent({
        id: 'pi_integration_race',
        amount: 5999,
        currency: 'usd',
        status: 'succeeded',
      }),
      completeCheckoutFromPaymentIntent({
        id: 'pi_integration_race',
        amount: 5999,
        currency: 'usd',
        status: 'succeeded',
      }),
    ])

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const orderCount = await prisma.order.count()
    const paymentCount = await prisma.payment.count({
      where: { stripePaymentIntentId: 'pi_integration_race' },
    })

    expect(results[1].id).toBe(results[0].id)
    expect(orderCount).toBe(1)
    expect(paymentCount).toBe(1)
    expect(updatedVariant.inventory).toBe(1)
  })

  it('fails paid order creation when inventory is exhausted and leaves state consistent', async () => {
    const { variant } = await seedCheckout({
      paymentIntentId: 'pi_integration_exhausted',
      inventory: 1,
      quantity: 2,
    })

    await expect(
      completeCheckoutFromPaymentIntent({
        id: 'pi_integration_exhausted',
        amount: 5999,
        currency: 'usd',
        status: 'succeeded',
      })
    ).rejects.toThrow(`Insufficient inventory for variant ${variant.id}`)

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const checkoutSession = await prisma.checkoutSession.findUniqueOrThrow({
      where: { paymentIntentId: 'pi_integration_exhausted' },
    })
    const orderCount = await prisma.order.count()
    const paymentCount = await prisma.payment.count()

    expect(updatedVariant.inventory).toBe(1)
    expect(checkoutSession.status).toBe('PENDING')
    expect(orderCount).toBe(0)
    expect(paymentCount).toBe(0)
  })

  it('creates discount applications and usage only after verified payment success', async () => {
    const { discount } = await seedCheckout({
      paymentIntentId: 'pi_integration_discount',
      inventory: 5,
      quantity: 2,
      discountCode: 'LAUNCH10',
    })

    expect(discount).not.toBeNull()
    expect(await prisma.discountApplication.count()).toBe(0)
    await expect(
      prisma.discount.findUniqueOrThrow({
        where: { id: discount!.id },
      })
    ).resolves.toMatchObject({ usageCount: 0 })

    const firstOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_discount',
      amount: 5499,
      currency: 'usd',
      status: 'succeeded',
    })
    const secondOrder = await completeCheckoutFromPaymentIntent({
      id: 'pi_integration_discount',
      amount: 5499,
      currency: 'usd',
      status: 'succeeded',
    })

    const paidOrder = await prisma.order.findUniqueOrThrow({
      where: { id: firstOrder.id },
      include: { discountApplications: true },
    })
    const updatedDiscount = await prisma.discount.findUniqueOrThrow({
      where: { id: discount!.id },
    })

    expect(secondOrder.id).toBe(firstOrder.id)
    expect(paidOrder.discountAmountCents).toBe(500)
    expect(paidOrder.totalCents).toBe(5499)
    expect(paidOrder.discountApplications).toEqual([
      expect.objectContaining({
        discountId: discount!.id,
        amountCents: 500,
      }),
    ])
    expect(await prisma.order.count()).toBe(1)
    expect(await prisma.discountApplication.count()).toBe(1)
    expect(updatedDiscount.usageCount).toBe(1)
  })

  it('keeps stock and paid-order state deterministic when concurrent checkout creates race near stock-out', async () => {
    const { variant, product } = await seedVariant({
      paymentIntentId: 'pi_checkout_create_race_seed',
      inventory: 1,
    })
    const waitAtStripeIntentCreation = createBarrier(2)
    let paymentIntentOrdinal = 0

    mocks.createStripePaymentIntent.mockImplementation(async (input: { amount: number; currency: string }) => {
      await waitAtStripeIntentCreation()
      paymentIntentOrdinal += 1
      return {
        id: `pi_checkout_create_race_${paymentIntentOrdinal}`,
        client_secret: `secret_checkout_create_race_${paymentIntentOrdinal}`,
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        status: 'requires_payment_method',
      }
    })

    const [firstCheckout, secondCheckout] = await Promise.all([
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: variant.id, quantity: 1 }],
        shippingAddress: address,
      }),
      createCheckoutPaymentIntent({
        email: 'ada@example.com',
        items: [{ variantId: variant.id, quantity: 1 }],
        shippingAddress: address,
      }),
    ])

    expect(firstCheckout.paymentIntentId).not.toBe(secondCheckout.paymentIntentId)
    expect(await prisma.checkoutSession.count()).toBe(2)
    expect(await prisma.order.count()).toBe(0)

    const completionResults = await Promise.allSettled([
      completeCheckoutFromPaymentIntent({
        id: firstCheckout.paymentIntentId,
        amount: Math.round(firstCheckout.total * 100),
        currency: 'usd',
        status: 'succeeded',
      }),
      completeCheckoutFromPaymentIntent({
        id: secondCheckout.paymentIntentId,
        amount: Math.round(secondCheckout.total * 100),
        currency: 'usd',
        status: 'succeeded',
      }),
    ])

    const successfulResults = completionResults.filter((result) => result.status === 'fulfilled')
    const rejectedResults = completionResults.filter((result) => result.status === 'rejected')

    expect(successfulResults).toHaveLength(1)
    expect(rejectedResults).toHaveLength(1)
    expect(String(rejectedResults[0].reason)).toContain(`Insufficient inventory for variant ${variant.id}`)

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const orderCount = await prisma.order.count()
    const paymentCount = await prisma.payment.count()
    const completedSessions = await prisma.checkoutSession.count({
      where: { status: 'COMPLETED' },
    })
    const pendingSessions = await prisma.checkoutSession.count({
      where: { status: 'PENDING' },
    })
    const createdOrderItems = await prisma.orderItem.findMany({
      include: { product: true },
    })

    expect(orderCount).toBe(1)
    expect(paymentCount).toBe(1)
    expect(updatedVariant.inventory).toBe(0)
    expect(completedSessions).toBe(1)
    expect(pendingSessions).toBe(1)
    expect(createdOrderItems).toHaveLength(1)
    expect(createdOrderItems[0].productId).toBe(product.id)
  })

  it('does not downgrade completed checkout state during conflicting success/failure webhook delivery', async () => {
    await seedCheckout({
      paymentIntentId: 'pi_integration_conflicting_webhooks',
      inventory: 5,
      quantity: 1,
    })

    await Promise.all([
      processStripeWebhookEvent({
        id: 'evt_conflict_success',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_integration_conflicting_webhooks',
            amount: 3499,
            currency: 'usd',
            status: 'succeeded',
          },
        },
      }),
      processStripeWebhookEvent({
        id: 'evt_conflict_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_integration_conflicting_webhooks',
            amount: 3499,
            currency: 'usd',
            status: 'requires_payment_method',
            last_payment_error: {
              message: 'Card declined',
            },
          },
        },
      }),
    ])

    await processStripeWebhookEvent({
      id: 'evt_conflict_failed_late',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_integration_conflicting_webhooks',
          amount: 3499,
          currency: 'usd',
          status: 'requires_payment_method',
          last_payment_error: {
            message: 'Card declined',
          },
        },
      },
    })

    const checkoutSession = await prisma.checkoutSession.findUniqueOrThrow({
      where: { paymentIntentId: 'pi_integration_conflicting_webhooks' },
    })
    const orderCount = await prisma.order.count()
    const paymentCount = await prisma.payment.count({
      where: { stripePaymentIntentId: 'pi_integration_conflicting_webhooks' },
    })

    expect(orderCount).toBe(1)
    expect(paymentCount).toBe(1)
    expect(checkoutSession.status).toBe('COMPLETED')
    expect(checkoutSession.failureReason).toBeNull()
  })

  it('issues digital grants through verified webhook-paid finalization without changing order/payment assertions', async () => {
    const { product, digitalAsset } = await seedDigitalCheckout({
      paymentIntentId: 'pi_integration_webhook_digital_grants',
      quantity: 1,
    })

    await processStripeWebhookEvent({
      id: 'evt_webhook_digital_grants',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_webhook_digital_grants',
          amount: 2000,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    })

    const order = await prisma.order.findFirstOrThrow({
      where: {
        payments: {
          some: {
            stripePaymentIntentId: 'pi_integration_webhook_digital_grants',
          },
        },
      },
      include: {
        payments: true,
      },
    })
    const grants = await prisma.digitalDownloadGrant.findMany({
      where: { orderId: order.id },
      select: {
        productId: true,
        digitalAssetId: true,
        tokenHash: true,
      },
    })

    expect(order.paymentStatus).toBe('PAID')
    expect(order.payments).toHaveLength(1)
    expect(grants).toEqual([
      expect.objectContaining({
        productId: product.id,
        digitalAssetId: digitalAsset.id,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ])
  })

  it('keeps paid order finalization committed when confirmation email delivery fails', async () => {
    await seedCheckout({
      paymentIntentId: 'pi_integration_email_failure',
      inventory: 5,
      quantity: 1,
    })

    const orderPaidHandler = integrationRegistry.find((handler) => handler.event === 'order.paid')
    if (!orderPaidHandler) {
      throw new Error('order.paid handler is required for this integration test')
    }

    const originalOrderPaidHandle = orderPaidHandler.handle
    orderPaidHandler.handle = async () => {
      throw new Error('Email delivery failed')
    }

    try {
      const order = await completeCheckoutFromPaymentIntent({
        id: 'pi_integration_email_failure',
        amount: 3499,
        currency: 'usd',
        status: 'succeeded',
      })

      const checkoutSession = await prisma.checkoutSession.findUniqueOrThrow({
        where: { paymentIntentId: 'pi_integration_email_failure' },
      })
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { stripePaymentIntentId: 'pi_integration_email_failure' },
      })

      expect(order.paymentStatus).toBe('PAID')
      expect(payment.status).toBe('PAID')
      expect(checkoutSession.status).toBe('COMPLETED')
      expect(await prisma.order.count()).toBe(1)
      expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBeGreaterThan(0)
    } finally {
      orderPaidHandler.handle = originalOrderPaidHandle
    }
  })

  it('enforces discount usage cap under concurrent paid-order finalization', async () => {
    const { product, variant } = await seedVariant({
      paymentIntentId: 'pi_discount_cap_seed',
      inventory: 4,
    })
    const discount = await prisma.discount.create({
      data: {
        code: 'CAP1',
        title: 'Cap One',
        type: 'CODE',
        method: 'PERCENTAGE',
        value: 20,
        usageLimit: 1,
        status: 'ACTIVE',
      },
    })

    await createCheckoutSession({
      paymentIntentId: 'pi_discount_cap_1',
      email: 'ada@example.com',
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku ?? 'SKU-1',
      priceCents: variant.priceCents,
      quantity: 1,
      discountApplication: {
        discountId: discount.id,
        code: discount.code,
        title: discount.title,
        method: discount.method,
        amountCents: 500,
      },
    })
    await createCheckoutSession({
      paymentIntentId: 'pi_discount_cap_2',
      email: 'ada@example.com',
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku ?? 'SKU-1',
      priceCents: variant.priceCents,
      quantity: 1,
      discountApplication: {
        discountId: discount.id,
        code: discount.code,
        title: discount.title,
        method: discount.method,
        amountCents: 500,
      },
    })

    const completionResults = await Promise.allSettled([
      completeCheckoutFromPaymentIntent({
        id: 'pi_discount_cap_1',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
      }),
      completeCheckoutFromPaymentIntent({
        id: 'pi_discount_cap_2',
        amount: 2999,
        currency: 'usd',
        status: 'succeeded',
      }),
    ])

    const successfulResults = completionResults.filter((result) => result.status === 'fulfilled')
    const rejectedResults = completionResults.filter((result) => result.status === 'rejected')

    expect(successfulResults).toHaveLength(1)
    expect(rejectedResults).toHaveLength(1)
    expect(String((rejectedResults[0] as PromiseRejectedResult).reason)).toContain(
      `Discount usage limit reached for ${discount.id}`
    )

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const updatedDiscount = await prisma.discount.findUniqueOrThrow({
      where: { id: discount.id },
    })

    expect(updatedVariant.inventory).toBe(3)
    expect(await prisma.order.count()).toBe(1)
    expect(await prisma.payment.count()).toBe(1)
    expect(await prisma.discountApplication.count()).toBe(1)
    expect(updatedDiscount.usageCount).toBe(1)
    expect(
      await prisma.checkoutSession.count({
        where: { status: 'COMPLETED' },
      })
    ).toBe(1)
    expect(
      await prisma.checkoutSession.count({
        where: { status: 'PENDING' },
      })
    ).toBe(1)
  })

  it('allows late payment success webhooks to finalize an expired checkout session once', async () => {
    await seedCheckout({
      paymentIntentId: 'pi_integration_late_success',
      inventory: 5,
      quantity: 1,
    })

    await prisma.checkoutSession.update({
      where: { paymentIntentId: 'pi_integration_late_success' },
      data: {
        status: 'EXPIRED',
        failureReason: 'Checkout session expired',
      },
    })

    await processStripeWebhookEvent({
      id: 'evt_late_success',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_late_success',
          amount: 3499,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    })

    await processStripeWebhookEvent({
      id: 'evt_late_success_duplicate',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_late_success',
          amount: 3499,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    })

    const checkoutSession = await prisma.checkoutSession.findUniqueOrThrow({
      where: { paymentIntentId: 'pi_integration_late_success' },
    })
    const paymentCount = await prisma.payment.count({
      where: { stripePaymentIntentId: 'pi_integration_late_success' },
    })

    expect(await prisma.order.count()).toBe(1)
    expect(paymentCount).toBe(1)
    expect(checkoutSession.status).toBe('COMPLETED')
    expect(checkoutSession.failureReason).toBeNull()
    expect(checkoutSession.completedAt).toBeInstanceOf(Date)
  })

  it('retries a failed webhook from the stored payload without duplicating commerce side effects', async () => {
    const { variant, discount } = await seedCheckout({
      paymentIntentId: 'pi_integration_retry_payload',
      inventory: 5,
      quantity: 2,
      discountCode: 'RETRY10',
    })
    const rawPayload = JSON.stringify({
      id: 'evt_retry_payload',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_retry_payload',
          amount: 5499,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    })

    const delivery = await recordWebhookDeliveryAttempt({
      provider: 'stripe',
      providerEventId: 'evt_retry_payload',
      eventType: 'payment_intent.succeeded',
      payload: rawPayload,
    })
    await storeVerifiedWebhookPayload({
      provider: 'stripe',
      providerEventId: delivery.providerEventId,
      rawPayload,
    })
    await markWebhookDeliveryFailed({
      provider: 'stripe',
      providerEventId: delivery.providerEventId,
      error: 'Transient database timeout',
      retryable: true,
    })
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { nextRetryAt: new Date(0) },
    })

    const dueDeliveries = await getDueWebhookDeliveriesForRetry(1, new Date())
    expect(dueDeliveries).toHaveLength(1)

    const claimedDelivery = await claimWebhookDeliveryForRetry(dueDeliveries[0].id)
    expect(claimedDelivery?.rawPayload).toBe(rawPayload)

    const event = parseStripeWebhookEventPayload(claimedDelivery!.rawPayload!)
    if (!event) {
      throw new Error('Stored retry payload should parse')
    }

    await processStripeWebhookEvent(event)
    await markWebhookDeliveryProcessed({
      provider: claimedDelivery!.provider,
      providerEventId: claimedDelivery!.providerEventId,
    })
    await processStripeWebhookEvent(event)

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    })
    const updatedDiscount = await prisma.discount.findUniqueOrThrow({
      where: { id: discount!.id },
    })
    const finalDelivery = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })

    expect(await prisma.order.count()).toBe(1)
    expect(await prisma.payment.count({ where: { stripePaymentIntentId: 'pi_integration_retry_payload' } })).toBe(1)
    expect(await prisma.discountApplication.count()).toBe(1)
    expect(updatedDiscount.usageCount).toBe(1)
    expect(updatedVariant.inventory).toBe(3)
    expect(finalDelivery.status).toBe('PROCESSED')
    expect(finalDelivery.rawPayload).toBe(rawPayload)
  })
})

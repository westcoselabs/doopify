import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixedNow = new Date('2026-04-29T12:00:00.000Z')

const mocks = vi.hoisted(() => ({
  prisma: {
    checkoutSession: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
    },
  },
  sendTrackedEmail: vi.fn(),
  buildAbandonedCheckoutRecoveryEmailMessage: vi.fn(),
  emitInternalEvent: vi.fn(),
  getStoreSettings: vi.fn(),
  buildCheckoutPricingWithDecisionsCents: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_STORE_URL: 'https://store.example.com',
  },
}))

vi.mock('@/server/services/email-delivery.service', () => ({
  sendTrackedEmail: mocks.sendTrackedEmail,
}))

vi.mock('@/server/services/email-template.service', () => ({
  buildAbandonedCheckoutRecoveryEmailMessage: mocks.buildAbandonedCheckoutRecoveryEmailMessage,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettings: mocks.getStoreSettings,
}))

vi.mock('@/server/checkout/pricing', () => ({
  buildCheckoutPricingWithDecisionsCents: mocks.buildCheckoutPricingWithDecisionsCents,
}))

import {
  markDueCheckoutsAbandoned,
  recoverCheckoutByToken,
  sendRecoveryEmailForCheckout,
} from './abandoned-checkout.service'

function checkoutSessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'checkout_1',
    paymentIntentId: 'pi_1',
    email: 'customer@example.com',
    status: 'PENDING',
    currency: 'USD',
    subtotalCents: 5000,
    shippingAmountCents: 999,
    taxAmountCents: 100,
    discountAmountCents: 0,
    totalCents: 6099,
    payload: {
      email: 'customer@example.com',
      items: [
        {
          productId: 'product_1',
          variantId: 'variant_1',
          title: 'Test Tee',
          variantTitle: 'Black / M',
          quantity: 1,
          priceCents: 5000,
        },
      ],
      shippingAddress: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        address1: '1 Main St',
        city: 'San Francisco',
        postalCode: '94103',
        country: 'US',
      },
      billingAddress: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        address1: '1 Main St',
        city: 'San Francisco',
        postalCode: '94103',
        country: 'US',
      },
    },
    abandonedAt: null,
    recoveryToken: null,
    recoveryEmailSentAt: null,
    recoveryEmailCount: 0,
    recoveredAt: null,
    completedAt: null,
    createdAt: new Date('2026-04-29T09:00:00.000Z'),
    updatedAt: new Date('2026-04-29T09:00:00.000Z'),
    ...overrides,
  }
}

describe('abandoned-checkout.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.checkoutSession.count.mockResolvedValue(0)
    mocks.prisma.checkoutSession.findMany.mockResolvedValue([])
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue(null)
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.productVariant.findMany.mockResolvedValue([])
    mocks.getStoreSettings.mockResolvedValue({
      currency: 'USD',
      shippingThresholdCents: 7500,
    })
    mocks.sendTrackedEmail.mockResolvedValue({ id: 'email_1' })
    mocks.buildAbandonedCheckoutRecoveryEmailMessage.mockResolvedValue({
      from: 'orders@example.com',
      subject: 'You left something behind',
      html: '<p>Resume checkout</p>',
    })
    mocks.buildCheckoutPricingWithDecisionsCents.mockReturnValue({
      subtotalCents: 5000,
      shippingAmountCents: 999,
      taxAmountCents: 100,
      discountAmountCents: 0,
      totalCents: 6099,
      shippingDecision: { source: 'fallback_flat_rate', rateName: 'Flat shipping' },
      taxDecision: { source: 'fallback_rate', jurisdiction: 'US' },
    })
  })

  it('marks due pending checkouts as abandoned', async () => {
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 1 })
    mocks.prisma.checkoutSession.findMany.mockResolvedValue([
      {
        id: 'checkout_1',
        email: 'customer@example.com',
        currency: 'USD',
        totalCents: 6099,
      },
    ])

    const result = await markDueCheckoutsAbandoned(fixedNow)

    expect(result).toEqual({ markedAbandoned: 1 })
    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { in: ['PENDING', 'FAILED'] },
        completedAt: null,
        abandonedAt: null,
      }),
      data: { abandonedAt: fixedNow },
    })
  })

  it('does not mark completed checkouts as abandoned', async () => {
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 0 })

    const result = await markDueCheckoutsAbandoned(fixedNow)

    expect(result).toEqual({ markedAbandoned: 0 })
  })

  it('skips recovery email sends when checkout has no email', async () => {
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue(
      checkoutSessionFixture({ email: null })
    )

    const result = await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })

    expect(result).toEqual({ sent: false, skippedReason: 'MISSING_EMAIL' })
    expect(mocks.sendTrackedEmail).not.toHaveBeenCalled()
  })

  it('increments recovery email count and sends recovery email', async () => {
    mocks.prisma.checkoutSession.findUnique
      .mockResolvedValueOnce(checkoutSessionFixture())
      .mockResolvedValueOnce(checkoutSessionFixture({
        recoveryToken: 'token_1',
        recoveryEmailCount: 1,
        recoveryEmailSentAt: fixedNow,
      }))
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 1 })

    const result = await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })

    expect(result).toEqual({ sent: true })
    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'checkout_1',
        AND: expect.arrayContaining([
          expect.objectContaining({ recoveryEmailCount: 0 }),
        ]),
      }),
      data: expect.objectContaining({
        recoveryEmailCount: { increment: 1 },
        recoveryEmailSentAt: fixedNow,
        recoveryToken: expect.any(String),
      }),
    })
    expect(mocks.sendTrackedEmail).toHaveBeenCalledTimes(1)
  })

  it('keeps an existing recovery token on later sends', async () => {
    mocks.prisma.checkoutSession.findUnique
      .mockResolvedValueOnce(checkoutSessionFixture({
        recoveryToken: 'existing_token',
        recoveryEmailCount: 1,
        recoveryEmailSentAt: new Date('2026-04-27T09:00:00.000Z'),
      }))
      .mockResolvedValueOnce(checkoutSessionFixture({
        recoveryToken: 'existing_token',
        recoveryEmailCount: 2,
        recoveryEmailSentAt: fixedNow,
      }))
    mocks.prisma.checkoutSession.updateMany.mockResolvedValue({ count: 1 })

    await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })

    expect(mocks.prisma.checkoutSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ recoveryEmailCount: 1 }),
        ]),
      }),
      data: expect.objectContaining({
        recoveryToken: 'existing_token',
      }),
    })
  })

  it('stops sending after max recovery sends', async () => {
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue(
      checkoutSessionFixture({ recoveryEmailCount: 3 })
    )

    const result = await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })

    expect(result).toEqual({ sent: false, skippedReason: 'MAX_SENDS_REACHED' })
    expect(mocks.sendTrackedEmail).not.toHaveBeenCalled()
  })

  it('prevents duplicate overlapping send claims', async () => {
    mocks.prisma.checkoutSession.findUnique
      .mockResolvedValueOnce(checkoutSessionFixture())
      .mockResolvedValueOnce(checkoutSessionFixture({
        recoveryToken: 'token_1',
        recoveryEmailCount: 1,
        recoveryEmailSentAt: fixedNow,
      }))
      .mockResolvedValueOnce(checkoutSessionFixture())
    mocks.prisma.checkoutSession.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const first = await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })
    const second = await sendRecoveryEmailForCheckout('checkout_1', { now: fixedNow })

    expect(first).toEqual({ sent: true })
    expect(second).toEqual({ sent: false, skippedReason: 'ALREADY_CLAIMED' })
    expect(mocks.sendTrackedEmail).toHaveBeenCalledTimes(1)
  })

  it('recovers digital-only checkouts without reintroducing shipping and preserves fulfillment type', async () => {
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue(
      checkoutSessionFixture({
        recoveryToken: '0123456789abcdef0123456789abcdef',
        payload: {
          email: 'customer@example.com',
          items: [
            {
              productId: 'product_digital',
              variantId: 'variant_digital',
              title: 'Digital Pack',
              quantity: 1,
              priceCents: 5000,
              fulfillmentType: 'DIGITAL',
            },
          ],
        },
      })
    )
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_digital',
        productId: 'product_digital',
        title: 'Default',
        priceCents: 5000,
        inventory: 5,
        product: {
          id: 'product_digital',
          title: 'Digital Pack',
          fulfillmentType: 'DIGITAL',
          status: 'ACTIVE',
        },
      },
    ])
    mocks.buildCheckoutPricingWithDecisionsCents.mockReturnValue({
      subtotalCents: 5000,
      shippingAmountCents: 0,
      taxAmountCents: 0,
      discountAmountCents: 0,
      totalCents: 5000,
      shippingDecision: { source: 'none' },
      taxDecision: { source: 'none' },
    })

    const result = await recoverCheckoutByToken('0123456789abcdef0123456789abcdef')

    expect(result).toMatchObject({
      ok: true,
      checkout: {
        items: [
          expect.objectContaining({
            variantId: 'variant_digital',
            fulfillmentType: 'DIGITAL',
          }),
        ],
        pricing: expect.objectContaining({
          shippingAmountCents: 0,
        }),
      },
    })
    expect(mocks.buildCheckoutPricingWithDecisionsCents).toHaveBeenCalledWith(
      expect.any(Array),
      7500,
      expect.objectContaining({
        shippingAddress: undefined,
        shippingRates: null,
        shippingZones: [],
      })
    )
  })

  it('keeps shipping pricing inputs for physical recovery payloads', async () => {
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue(
      checkoutSessionFixture({
        recoveryToken: 'fedcba9876543210fedcba9876543210',
      })
    )
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        productId: 'product_1',
        title: 'Default',
        priceCents: 5000,
        inventory: 5,
        product: {
          id: 'product_1',
          title: 'Test Tee',
          fulfillmentType: 'PHYSICAL',
          status: 'ACTIVE',
        },
      },
    ])

    await recoverCheckoutByToken('fedcba9876543210fedcba9876543210')

    expect(mocks.buildCheckoutPricingWithDecisionsCents).toHaveBeenCalledWith(
      expect.any(Array),
      7500,
      expect.objectContaining({
        shippingAddress: expect.objectContaining({
          country: 'US',
        }),
        shippingRates: expect.objectContaining({
          domesticCents: expect.any(Number),
          internationalCents: expect.any(Number),
        }),
      })
    )
  })

  it('rejects invalid recovery tokens safely', async () => {
    const result = await recoverCheckoutByToken('bad')
    expect(result).toEqual({ ok: false, reason: 'INVALID_TOKEN' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    promotion: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import { loadAutomaticPromotionsForCheckout } from '@/server/promotions/checkout-loader.service'

describe('loadAutomaticPromotionsForCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps ACTIVE and SCHEDULED promotions into evaluator definitions', async () => {
    mocks.prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo_1',
        name: 'Qualifier 10%',
        status: 'ACTIVE',
        type: 'PRODUCT_GROUP_DISCOUNT',
        rewardType: 'PERCENTAGE',
        value: 10,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 50,
        qualifiers: [
          {
            productId: 'product_1',
            variantId: 'variant_1',
            requiredQuantity: 1,
            variant: { product: { fulfillmentType: 'PHYSICAL' } },
          },
        ],
        rewards: [],
      },
    ])

    const result = await loadAutomaticPromotionsForCheckout()

    expect(result.promotions).toEqual([
      {
        id: 'promo_1',
        name: 'Qualifier 10%',
        status: 'ACTIVE',
        type: 'PRODUCT_GROUP_DISCOUNT',
        rewardType: 'PERCENTAGE',
        value: 10,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 50,
        qualifiers: [{ productId: 'product_1', variantId: 'variant_1', requiredQuantity: 1 }],
        rewards: [],
      },
    ])
    expect(result.skippedPromotions).toHaveLength(0)
    expect(mocks.prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: ['ACTIVE', 'SCHEDULED'],
          },
        },
      })
    )
  })

  it('skips PRODUCT_GROUP_DISCOUNT records that define explicit rewards', async () => {
    mocks.prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo_with_rewards',
        name: 'Ambiguous product group',
        status: 'ACTIVE',
        type: 'PRODUCT_GROUP_DISCOUNT',
        rewardType: 'PERCENTAGE',
        value: 15,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 10,
        qualifiers: [
          {
            productId: 'product_1',
            variantId: 'variant_1',
            requiredQuantity: 1,
            variant: { product: { fulfillmentType: 'PHYSICAL' } },
          },
        ],
        rewards: [
          {
            productId: 'product_2',
            variantId: 'variant_2',
            rewardQuantity: 1,
            variant: { product: { fulfillmentType: 'PHYSICAL' } },
          },
        ],
      },
    ])

    const result = await loadAutomaticPromotionsForCheckout()

    expect(result.promotions).toHaveLength(0)
    expect(result.skippedPromotions).toEqual([
      expect.objectContaining({
        promotionId: 'promo_with_rewards',
        reason: 'EXPLICIT_PRODUCT_GROUP_REWARDS',
      }),
    ])
  })

  it('skips promotions that include non-physical qualifier or reward variants', async () => {
    mocks.prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo_digital',
        name: 'Digital not allowed',
        status: 'ACTIVE',
        type: 'FREE_GIFT',
        rewardType: 'FREE',
        value: 0,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 100,
        qualifiers: [
          {
            productId: 'product_1',
            variantId: 'variant_1',
            requiredQuantity: 1,
            variant: { product: { fulfillmentType: 'PHYSICAL' } },
          },
        ],
        rewards: [
          {
            productId: 'product_2',
            variantId: 'variant_2',
            rewardQuantity: 1,
            variant: { product: { fulfillmentType: 'DIGITAL' } },
          },
        ],
      },
    ])

    const result = await loadAutomaticPromotionsForCheckout()

    expect(result.promotions).toHaveLength(0)
    expect(result.skippedPromotions).toEqual([
      expect.objectContaining({
        promotionId: 'promo_digital',
        reason: 'NON_PHYSICAL_VARIANT',
      }),
    ])
  })
})

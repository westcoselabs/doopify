import { describe, expect, it } from 'vitest'

import {
  type PromotionCartLine,
  type PromotionDefinition,
} from '@/server/promotions/contracts'
import { evaluatePromotions } from '@/server/promotions/evaluator'

function baseCartLines(): PromotionCartLine[] {
  return [
    {
      variantId: 'variant_shirt',
      productId: 'product_shirt',
      quantity: 2,
      unitPriceCents: 2000,
      fulfillmentType: 'PHYSICAL',
    },
    {
      variantId: 'variant_hat',
      productId: 'product_hat',
      quantity: 2,
      unitPriceCents: 1000,
      fulfillmentType: 'PHYSICAL',
    },
    {
      variantId: 'variant_sticker',
      productId: 'product_sticker',
      quantity: 2,
      unitPriceCents: 500,
      fulfillmentType: 'PHYSICAL',
    },
  ]
}

function makePromotion(overrides: Partial<PromotionDefinition> = {}): PromotionDefinition {
  return {
    id: 'promo_1',
    name: 'Group 15%',
    status: 'ACTIVE',
    type: 'PRODUCT_GROUP_DISCOUNT',
    rewardType: 'PERCENTAGE',
    value: 15,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    priority: 100,
    qualifiers: [
      { variantId: 'variant_shirt', productId: 'product_shirt', requiredQuantity: 1 },
      { variantId: 'variant_hat', productId: 'product_hat', requiredQuantity: 1 },
    ],
    rewards: [],
    ...overrides,
  }
}

describe('evaluatePromotions', () => {
  it('returns no applications when no promotions are provided', () => {
    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [],
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.totalDiscountCents).toBe(0)
  })

  it('skips promotions with inactive status and expired windows', () => {
    const now = new Date('2026-05-29T12:00:00.000Z')
    const inactive = makePromotion({ id: 'inactive', status: 'DISABLED' })
    const notStarted = makePromotion({
      id: 'not_started',
      startsAt: '2026-05-30T12:00:00.000Z',
    })
    const expired = makePromotion({
      id: 'expired',
      endsAt: '2026-05-28T12:00:00.000Z',
    })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [inactive, notStarted, expired],
      now,
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions.map((s) => s.reason).sort()).toEqual([
      'EXPIRED',
      'INACTIVE_STATUS',
      'NOT_STARTED',
    ])
  })

  it('skips promotions when usage limit is exhausted', () => {
    const promo = makePromotion({ usageLimit: 1, usageCount: 1 })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [promo],
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('USAGE_LIMIT_REACHED')
  })

  it('skips automatic promotions when code discount is present under V1 stack policy', () => {
    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [makePromotion()],
      discountCode: 'WELCOME10',
    })

    expect(result.blockedByCodeDiscount).toBe(true)
    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('BLOCKED_BY_CODE_DISCOUNT')
  })

  it('applies product group percent discount to qualifier variants', () => {
    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [makePromotion({ value: 10 })],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    const applied = result.appliedPromotions[0]
    expect(applied.amountCents).toBe(600)
    expect(applied.lineAllocations.map((allocation) => allocation.variantId).sort()).toEqual([
      'variant_hat',
      'variant_shirt',
    ])
  })

  it('applies product group fixed amount safely without negative totals', () => {
    const result = evaluatePromotions({
      cartLines: [
        {
          variantId: 'variant_shirt',
          productId: 'product_shirt',
          quantity: 1,
          unitPriceCents: 2000,
          fulfillmentType: 'PHYSICAL',
        },
        {
          variantId: 'variant_hat',
          productId: 'product_hat',
          quantity: 1,
          unitPriceCents: 1000,
          fulfillmentType: 'PHYSICAL',
        },
      ],
      promotions: [
        makePromotion({
          rewardType: 'FIXED_AMOUNT',
          value: 5000,
        }),
      ],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    expect(result.appliedPromotions[0].amountCents).toBe(3000)
    expect(
      result.appliedPromotions[0].lineAllocations.reduce((sum, line) => sum + line.discountCents, 0)
    ).toBe(3000)
  })

  it('applies Buy X Get Y discount only when reward item is already in cart', () => {
    const promo = makePromotion({
      id: 'promo_bxy',
      type: 'BUY_X_GET_Y',
      rewardType: 'PERCENTAGE',
      value: 50,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [promo],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    const allocations = result.appliedPromotions[0].lineAllocations
    expect(allocations).toHaveLength(1)
    expect(allocations[0].variantId).toBe('variant_sticker')
  })

  it('does not auto-add reward lines for Buy X Get Y', () => {
    const promo = makePromotion({
      id: 'promo_bxy',
      type: 'BUY_X_GET_Y',
      rewardType: 'PERCENTAGE',
      value: 50,
      rewards: [{ variantId: 'variant_reward_missing', productId: 'product_reward_missing', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [promo],
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('MISSING_REWARDS')
  })

  it('applies Free Gift as 100% off when reward is in cart', () => {
    const promo = makePromotion({
      id: 'promo_free',
      type: 'FREE_GIFT',
      rewardType: 'FREE',
      value: 0,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [promo],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    expect(result.appliedPromotions[0].amountCents).toBe(1000)
    expect(result.appliedPromotions[0].lineAllocations[0].discountCents).toBe(1000)
  })

  it('skips promotion when qualifiers are missing', () => {
    const cartLines = baseCartLines().filter((line) => line.variantId !== 'variant_hat')

    const result = evaluatePromotions({
      cartLines,
      promotions: [makePromotion()],
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('MISSING_QUALIFIERS')
  })

  it('skips Buy X Get Y and Free Gift when reward lines are missing', () => {
    const cartLines = baseCartLines().filter((line) => line.variantId !== 'variant_sticker')
    const bxy = makePromotion({
      id: 'promo_bxy',
      type: 'BUY_X_GET_Y',
      rewardType: 'PERCENTAGE',
      value: 50,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })
    const freeGift = makePromotion({
      id: 'promo_free',
      type: 'FREE_GIFT',
      rewardType: 'FREE',
      value: 0,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions({
      cartLines,
      promotions: [bxy, freeGift],
    })

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions.map((s) => s.reason)).toEqual(['MISSING_REWARDS', 'MISSING_REWARDS'])
  })

  it('enforces physical-only restrictions when digital lines are involved', () => {
    const cartLines = baseCartLines().map((line) =>
      line.variantId === 'variant_sticker' ? { ...line, fulfillmentType: 'DIGITAL' as const } : line
    )
    const promo = makePromotion({
      id: 'promo_free',
      type: 'FREE_GIFT',
      rewardType: 'FREE',
      value: 0,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions(
      {
        cartLines,
        promotions: [promo],
      },
      { physicalOnly: true }
    )

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('PHYSICAL_ONLY_RESTRICTION')
  })

  it('treats unknown fulfillment types as ineligible under physical-only policy', () => {
    const cartLines = baseCartLines().map((line) =>
      line.variantId === 'variant_sticker' ? { ...line, fulfillmentType: null } : line
    )
    const promo = makePromotion({
      id: 'promo_free_unknown',
      type: 'FREE_GIFT',
      rewardType: 'FREE',
      value: 0,
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions(
      {
        cartLines,
        promotions: [promo],
      },
      { physicalOnly: true }
    )

    expect(result.appliedPromotions).toHaveLength(0)
    expect(result.skippedPromotions[0]?.reason).toBe('PHYSICAL_ONLY_RESTRICTION')
  })

  it('chooses the highest-value eligible promotion when multiple apply', () => {
    const lower = makePromotion({ id: 'promo_low', value: 10 })
    const higher = makePromotion({ id: 'promo_high', value: 20 })

    const result = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [lower, higher],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    expect(result.appliedPromotions[0].promotionId).toBe('promo_high')
    expect(result.skippedPromotions.some((skip) => skip.reason === 'NOT_SELECTED_BETTER_PROMOTION')).toBe(true)
  })

  it('uses deterministic tie-breakers by priority then promotion id', () => {
    const promoPriorityWins = makePromotion({
      id: 'promo_priority_wins',
      name: 'Priority wins',
      value: 15,
      priority: 10,
    })
    const promoPriorityLoses = makePromotion({
      id: 'promo_priority_loses',
      name: 'Priority loses',
      value: 15,
      priority: 20,
    })

    const firstResult = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [promoPriorityLoses, promoPriorityWins],
    })
    expect(firstResult.appliedPromotions[0].promotionId).toBe('promo_priority_wins')

    const samePriorityA = makePromotion({ id: 'promo_a', value: 15, priority: 50 })
    const samePriorityB = makePromotion({ id: 'promo_b', value: 15, priority: 50 })
    const secondResult = evaluatePromotions({
      cartLines: baseCartLines(),
      promotions: [samePriorityB, samePriorityA],
    })
    expect(secondResult.appliedPromotions[0].promotionId).toBe('promo_a')
  })

  it('never allocates more discount than eligible line subtotals', () => {
    const result = evaluatePromotions({
      cartLines: [
        {
          variantId: 'variant_shirt',
          productId: 'product_shirt',
          quantity: 1,
          unitPriceCents: 100,
          fulfillmentType: 'PHYSICAL',
        },
        {
          variantId: 'variant_hat',
          productId: 'product_hat',
          quantity: 1,
          unitPriceCents: 50,
          fulfillmentType: 'PHYSICAL',
        },
      ],
      promotions: [
        makePromotion({
          rewardType: 'FIXED_AMOUNT',
          value: 9999,
        }),
      ],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    const allocations = result.appliedPromotions[0].lineAllocations
    expect(allocations.find((line) => line.variantId === 'variant_shirt')?.discountCents).toBeLessThanOrEqual(100)
    expect(allocations.find((line) => line.variantId === 'variant_hat')?.discountCents).toBeLessThanOrEqual(50)
    expect(result.appliedPromotions[0].amountCents).toBe(150)
  })

  it('respects qualifier and reward quantity limits', () => {
    const promo = makePromotion({
      id: 'promo_bxy_quantity',
      type: 'BUY_X_GET_Y',
      rewardType: 'FREE',
      value: 0,
      qualifiers: [{ variantId: 'variant_shirt', productId: 'product_shirt', requiredQuantity: 2 }],
      rewards: [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }],
    })

    const result = evaluatePromotions({
      cartLines: [
        {
          variantId: 'variant_shirt',
          productId: 'product_shirt',
          quantity: 4,
          unitPriceCents: 2000,
          fulfillmentType: 'PHYSICAL',
        },
        {
          variantId: 'variant_sticker',
          productId: 'product_sticker',
          quantity: 5,
          unitPriceCents: 500,
          fulfillmentType: 'PHYSICAL',
        },
      ],
      promotions: [promo],
    })

    expect(result.appliedPromotions).toHaveLength(1)
    const allocation = result.appliedPromotions[0].lineAllocations[0]
    expect(allocation.variantId).toBe('variant_sticker')
    expect(allocation.quantityDiscounted).toBe(2)
    expect(allocation.discountCents).toBe(1000)
  })
})

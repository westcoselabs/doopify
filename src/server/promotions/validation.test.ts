import { describe, expect, it } from 'vitest'

import { type PromotionDraftInput } from '@/server/promotions/contracts'
import { validatePromotionDraft } from '@/server/promotions/validation'

function buildValidInput(): PromotionDraftInput {
  return {
    name: 'Hoodie + Hat 15% Off',
    type: 'PRODUCT_GROUP_DISCOUNT',
    rewardType: 'PERCENTAGE',
    value: 15,
    qualifiers: [
      { variantId: 'variant_hoodie', productId: 'product_hoodie', requiredQuantity: 1 },
      { variantId: 'variant_hat', productId: 'product_hat', requiredQuantity: 1 },
    ],
    rewards: [],
  }
}

describe('validatePromotionDraft', () => {
  it('accepts a valid product group discount promotion payload', () => {
    const result = validatePromotionDraft(buildValidInput(), {
      variantCatalogById: {
        variant_hoodie: {
          variantId: 'variant_hoodie',
          productId: 'product_hoodie',
          fulfillmentType: 'PHYSICAL',
        },
        variant_hat: {
          variantId: 'variant_hat',
          productId: 'product_hat',
          fulfillmentType: 'PHYSICAL',
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects missing name', () => {
    const input = buildValidInput()
    input.name = '   '

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'MISSING_NAME')).toBe(true)
  })

  it('rejects invalid promotion type values at runtime payload boundaries', () => {
    const input = {
      ...buildValidInput(),
      type: 'NOT_A_REAL_TYPE',
    } as unknown as PromotionDraftInput

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'INVALID_TYPE')).toBe(true)
  })

  it('rejects FREE_GIFT promotion when rewardType is not FREE', () => {
    const input = buildValidInput()
    input.type = 'FREE_GIFT'
    input.rewardType = 'PERCENTAGE'
    input.rewards = [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }]

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(
      result.errors.some(
        (error) =>
          error.code === 'INVALID_REWARD_TYPE_FOR_PROMOTION_TYPE' && error.path === 'rewardType'
      )
    ).toBe(true)
  })

  it('rejects BUY_X_GET_Y promotions with no rewards', () => {
    const input = buildValidInput()
    input.type = 'BUY_X_GET_Y'
    input.rewardType = 'FIXED_AMOUNT'
    input.value = 500
    input.rewards = []

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'MISSING_REWARDS')).toBe(true)
  })

  it('rejects duplicate qualifier variants', () => {
    const input = buildValidInput()
    input.qualifiers.push({ variantId: 'variant_hat', productId: 'product_hat', requiredQuantity: 1 })

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'DUPLICATE_VARIANT')).toBe(true)
  })

  it('rejects invalid required and reward quantities', () => {
    const input = buildValidInput()
    input.type = 'BUY_X_GET_Y'
    input.rewardType = 'FIXED_AMOUNT'
    input.value = 250
    input.qualifiers[0].requiredQuantity = 0
    input.rewards = [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 0 }]

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'INVALID_REQUIRED_QUANTITY')).toBe(true)
    expect(result.errors.some((error) => error.code === 'INVALID_REWARD_QUANTITY')).toBe(true)
  })

  it('rejects invalid usage limits when provided', () => {
    const input = buildValidInput()
    input.usageLimit = 0

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'INVALID_USAGE_LIMIT')).toBe(true)
  })

  it('rejects invalid date windows where startsAt is after endsAt', () => {
    const input = buildValidInput()
    input.startsAt = '2026-06-10T00:00:00.000Z'
    input.endsAt = '2026-06-09T00:00:00.000Z'

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'INVALID_DATE_RANGE')).toBe(true)
  })

  it('rejects digital qualifier and reward variants in V1', () => {
    const input = buildValidInput()
    input.type = 'FREE_GIFT'
    input.rewardType = 'FREE'
    input.value = 0
    input.rewards = [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }]

    const result = validatePromotionDraft(input, {
      variantCatalogById: {
        variant_hoodie: {
          variantId: 'variant_hoodie',
          productId: 'product_hoodie',
          fulfillmentType: 'PHYSICAL',
        },
        variant_hat: {
          variantId: 'variant_hat',
          productId: 'product_hat',
          fulfillmentType: 'DIGITAL',
        },
        variant_sticker: {
          variantId: 'variant_sticker',
          productId: 'product_sticker',
          fulfillmentType: 'DIGITAL',
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors.filter((error) => error.code === 'DIGITAL_VARIANT_NOT_ALLOWED').length).toBe(2)
  })

  it('returns a warning when physical-only checks cannot run without catalog context', () => {
    const result = validatePromotionDraft(buildValidInput())

    expect(result.ok).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'PHYSICAL_ONLY_NOT_VERIFIED')).toBe(true)
  })

  it('rejects ambiguous variant overlap for BUY_X_GET_Y', () => {
    const input = buildValidInput()
    input.type = 'BUY_X_GET_Y'
    input.rewardType = 'FREE'
    input.value = 0
    input.rewards = [{ variantId: 'variant_hoodie', productId: 'product_hoodie', rewardQuantity: 1 }]

    const result = validatePromotionDraft(input)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === 'AMBIGUOUS_VARIANT_ROLE')).toBe(true)
  })

  it('rejects invalid reward value for percentage and free reward types', () => {
    const freeGiftInput = buildValidInput()
    freeGiftInput.type = 'FREE_GIFT'
    freeGiftInput.rewardType = 'FREE'
    freeGiftInput.value = 1
    freeGiftInput.rewards = [{ variantId: 'variant_sticker', productId: 'product_sticker', rewardQuantity: 1 }]

    const percentageInput = buildValidInput()
    percentageInput.rewardType = 'PERCENTAGE'
    percentageInput.value = 0

    const freeGiftResult = validatePromotionDraft(freeGiftInput)
    const percentageResult = validatePromotionDraft(percentageInput)

    expect(freeGiftResult.ok).toBe(false)
    expect(freeGiftResult.errors.some((error) => error.path === 'value')).toBe(true)
    expect(percentageResult.ok).toBe(false)
    expect(percentageResult.errors.some((error) => error.path === 'value')).toBe(true)
  })
})

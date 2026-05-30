import { describe, expect, it } from 'vitest'

import {
  buildPromotionListQuery,
  buildPromotionPayloadFromDraft,
  buildPromotionPreview,
  canSubmitPromotionDraft,
  createPromotionDraft,
  extractPromotionValidationIssues,
  formatRewardSummary,
  normalizePromotionDraftForType,
} from './promotions-ui.helpers'

describe('promotions UI helpers', () => {
  it('builds list query params with valid filters and search', () => {
    const query = buildPromotionListQuery({
      search: 'hoodie',
      status: 'ACTIVE',
      type: 'FREE_GIFT',
      page: 2,
      pageSize: 50,
    })

    expect(query).toContain('search=hoodie')
    expect(query).toContain('status=ACTIVE')
    expect(query).toContain('type=FREE_GIFT')
    expect(query).toContain('page=2')
    expect(query).toContain('pageSize=50')
  })

  it('does not include ALL filters in list query params', () => {
    const query = buildPromotionListQuery({
      search: '',
      status: 'ALL',
      type: 'ALL',
    })

    expect(query).not.toContain('status=')
    expect(query).not.toContain('type=')
    expect(query).toContain('page=1')
    expect(query).toContain('pageSize=20')
  })

  it('normalizes product group discounts to omit reward rows', () => {
    const draft = {
      ...createPromotionDraft('PRODUCT_GROUP_DISCOUNT'),
      rewards: [
        {
          variantId: 'var_reward',
          productTitle: 'Hat',
          variantTitle: 'Default',
          sku: 'HAT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const normalized = normalizePromotionDraftForType(draft)
    expect(normalized.rewards).toHaveLength(0)
  })

  it('forces free gift payload to FREE reward type and zero value', () => {
    const draft = {
      ...createPromotionDraft('FREE_GIFT'),
      rewardType: 'PERCENTAGE' as const,
      value: '50',
      name: 'Free sticker',
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Sticker',
          variantTitle: 'Pack',
          sku: 'ST-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const payload = buildPromotionPayloadFromDraft(draft)
    expect(payload.rewardType).toBe('FREE')
    expect(payload.value).toBe(0)
  })

  it('builds payload rows with required and reward quantities', () => {
    const draft = {
      ...createPromotionDraft('BUY_X_GET_Y'),
      name: 'Hoodie hat',
      value: '20',
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 2,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Hat',
          variantTitle: 'Blue',
          sku: 'HT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const payload = buildPromotionPayloadFromDraft(draft)
    expect(payload.qualifiers).toEqual([{ variantId: 'var_q', requiredQuantity: 2 }])
    expect(payload.rewards).toEqual([{ variantId: 'var_r', rewardQuantity: 1 }])
  })

  it('formats reward summaries for percentage, fixed amount, and free gift', () => {
    expect(
      formatRewardSummary({
        type: 'BUY_X_GET_Y',
        rewardType: 'PERCENTAGE',
        value: 15,
      })
    ).toBe('15% off')
    expect(
      formatRewardSummary({
        type: 'BUY_X_GET_Y',
        rewardType: 'FIXED_AMOUNT',
        value: 5,
      })
    ).toBe('$5.00 off')
    expect(
      formatRewardSummary({
        type: 'FREE_GIFT',
        rewardType: 'FREE',
        value: 0,
      })
    ).toBe('Free reward items')
  })

  it('builds plain-English previews including V1 cart behavior wording', () => {
    const preview = buildPromotionPreview({
      ...createPromotionDraft('BUY_X_GET_Y'),
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Hat',
          variantTitle: 'Blue',
          sku: 'HT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      value: '50',
    })

    expect(preview).toContain('if those reward items are also in the cart')
  })

  it('extracts structured validation issues from service-style errors payload', () => {
    const issues = extractPromotionValidationIssues({
      errors: [{ path: 'qualifiers[0].variantId', code: 'UNKNOWN_VARIANT', message: 'Variant not found' }],
    })

    expect(issues).toEqual([
      {
        path: 'qualifiers[0].variantId',
        code: 'UNKNOWN_VARIANT',
        message: 'Variant not found',
      },
    ])
  })

  it('extracts field errors from zod-style payload shape', () => {
    const issues = extractPromotionValidationIssues({
      fieldErrors: {
        name: ['Name is required'],
        value: ['Expected number'],
      },
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name', message: 'Name is required' }),
        expect.objectContaining({ path: 'value', message: 'Expected number' }),
      ])
    )
  })

  it('requires basic minimum fields before allowing submit', () => {
    const missingName = createPromotionDraft('PRODUCT_GROUP_DISCOUNT')
    missingName.qualifiers = [
      {
        variantId: 'var_q',
        productTitle: 'Hoodie',
        variantTitle: 'Black',
        sku: 'HD-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]
    missingName.value = '15'

    expect(canSubmitPromotionDraft(missingName)).toBe(false)

    const readyDraft = {
      ...missingName,
      name: 'Bundle savings',
    }

    expect(canSubmitPromotionDraft(readyDraft)).toBe(true)
  })

  it('requires reward rows for reward-based promotion types', () => {
    const buyX = createPromotionDraft('BUY_X_GET_Y')
    buyX.name = 'Buy hoodie get hat'
    buyX.value = '20'
    buyX.qualifiers = [
      {
        variantId: 'var_q',
        productTitle: 'Hoodie',
        variantTitle: 'Black',
        sku: 'HD-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]

    expect(canSubmitPromotionDraft(buyX)).toBe(false)

    buyX.rewards = [
      {
        variantId: 'var_r',
        productTitle: 'Hat',
        variantTitle: 'Blue',
        sku: 'HT-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]

    expect(canSubmitPromotionDraft(buyX)).toBe(true)
  })
})

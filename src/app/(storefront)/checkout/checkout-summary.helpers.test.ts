import { describe, expect, it } from 'vitest'

import {
  buildCheckoutDiscountRows,
  buildCheckoutPromotionHighlights,
} from './checkout-summary.helpers'

describe('checkout summary helpers', () => {
  it('shows promotion discount amount when provided', () => {
    const rows = buildCheckoutDiscountRows({
      discountAmountCents: 1250,
      promotionDiscountAmountCents: 1250,
      promotionApplications: [{ promotionName: 'Hoodie + Hat bundle savings', amountCents: 1250 }],
    })

    expect(rows).toEqual([
      { key: 'promotion', label: 'Hoodie + Hat bundle savings', amount: 12.5 },
      { key: 'total', label: 'Total discounts', amount: 12.5 },
    ])
  })

  it('distinguishes code and promotion discounts when both are present', () => {
    const rows = buildCheckoutDiscountRows({
      discountAmountCents: 1500,
      codeDiscountAmountCents: 500,
      promotionDiscountAmountCents: 1000,
      discountApplications: [{ code: 'SAVE5' }],
      promotionApplications: [{ promotionName: 'Automatic bundle offer', amountCents: 1000 }],
    })

    expect(rows).toEqual([
      { key: 'code', label: 'Code discount (SAVE5)', amount: 5 },
      { key: 'promotion', label: 'Automatic bundle offer', amount: 10 },
      { key: 'total', label: 'Total discounts', amount: 15 },
    ])
  })

  it('includes promotion application names for customer-visible highlights', () => {
    const highlights = buildCheckoutPromotionHighlights({
      promotionApplications: [{ promotionName: 'Hoodie + Hat bundle savings', amountCents: 1250 }],
    })

    expect(highlights).toEqual([
      {
        id: 'Hoodie + Hat bundle savings-0',
        label: 'Hoodie + Hat bundle savings',
        amount: 12.5,
      },
    ])
  })

  it('does not show promotion discount row when no promotion discount exists', () => {
    const rows = buildCheckoutDiscountRows({
      discountAmountCents: 500,
      codeDiscountAmountCents: 500,
      promotionDiscountAmountCents: 0,
      discountApplications: [{ code: 'SAVE5' }],
      promotionApplications: [{ promotionName: 'Bundle offer', amountCents: 0 }],
    })

    expect(rows).toEqual([
      { key: 'code', label: 'Code discount (SAVE5)', amount: 5 },
      { key: 'total', label: 'Total discounts', amount: 5 },
    ])
  })
})

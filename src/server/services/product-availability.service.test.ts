import { describe, expect, it } from 'vitest'

import {
  canPurchaseVariant,
  getProductAvailabilityBadge,
  resolveEffectiveSalesMode,
} from './product-availability.service'

describe('product availability service', () => {
  it('treats coming soon products as non-purchasable', () => {
    const result = canPurchaseVariant(
      {
        salesMode: 'COMING_SOON',
      },
      {
        inventory: 50,
        continueSellingWhenOutOfStock: true,
      },
      1
    )

    expect(result.ok).toBe(false)
  })

  it('keeps presale products purchasable when presale has started', () => {
    const result = canPurchaseVariant(
      {
        salesMode: 'PRESALE',
        presaleStartsAt: new Date(Date.now() - 60_000),
      },
      {
        inventory: 0,
        continueSellingWhenOutOfStock: true,
      },
      2
    )

    expect(result.ok).toBe(true)
  })

  it('uses continue selling to allow checkout when inventory is below requested quantity', () => {
    const result = canPurchaseVariant(
      {
        salesMode: 'STANDARD',
      },
      {
        inventory: 0,
        continueSellingWhenOutOfStock: true,
      },
      1
    )

    expect(result.ok).toBe(true)
  })

  it('resolves badge priority with coming soon above digital and stock states', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'COMING_SOON',
        fulfillmentType: 'DIGITAL',
      },
      variants: [{ inventory: 0, continueSellingWhenOutOfStock: true }],
    })

    expect(badge).toBe('COMING_SOON')
  })

  it('normalizes active presale to STANDARD after presale end date', () => {
    const mode = resolveEffectiveSalesMode({
      salesMode: 'PRESALE',
      presaleStartsAt: new Date(Date.now() - 86_400_000),
      presaleEndsAt: new Date(Date.now() - 60_000),
    })

    expect(mode).toBe('STANDARD')
  })
})

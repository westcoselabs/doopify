import { describe, expect, it } from 'vitest'

import {
  canPurchaseVariant,
  getAvailabilityMessage,
  getProductAvailabilityBadge,
  getVariantInventoryReadiness,
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

  it('treats future-start presale products as coming soon and non-purchasable', () => {
    const result = canPurchaseVariant(
      {
        salesMode: 'PRESALE',
        presaleStartsAt: new Date(Date.now() + 60_000),
      },
      {
        inventory: 50,
        continueSellingWhenOutOfStock: true,
      },
      1
    )

    expect(result.ok).toBe(false)
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

  it('blocks checkout when inventory is zero and continue selling is disabled', () => {
    const result = canPurchaseVariant(
      {
        salesMode: 'STANDARD',
      },
      {
        inventory: 0,
        continueSellingWhenOutOfStock: false,
      },
      1
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('Only 0 units left for this variant.')
    }
  })

  it('resolves badge priority with coming soon above stock states for legacy digital products', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'COMING_SOON',
        fulfillmentType: 'DIGITAL',
      },
      variants: [{ inventory: 0, continueSellingWhenOutOfStock: true }],
    })

    expect(badge).toBe('COMING_SOON')
  })

  it('keeps presale badge above stock states for legacy digital products', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'PRESALE',
        fulfillmentType: 'DIGITAL',
        presaleStartsAt: new Date(Date.now() - 60_000),
      },
      variants: [{ inventory: 0, continueSellingWhenOutOfStock: true }],
    })

    expect(badge).toBe('PRESALE')
  })

  it('does not show product-level BACKORDER when any variant is in stock', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
      },
      variants: [
        { inventory: 5, continueSellingWhenOutOfStock: false },
        { inventory: 0, continueSellingWhenOutOfStock: true },
      ],
    })

    expect(badge).toBeNull()
  })

  it('shows product-level BACKORDER when all variants are out of stock and at least one can continue selling', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
      },
      variants: [
        { inventory: 0, continueSellingWhenOutOfStock: false },
        { inventory: 0, continueSellingWhenOutOfStock: true },
      ],
    })

    expect(badge).toBe('BACKORDER')
  })

  it('shows SOLD_OUT when all variants are out of stock and none can continue selling', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
      },
      variants: [
        { inventory: 0, continueSellingWhenOutOfStock: false },
        { inventory: 0, continueSellingWhenOutOfStock: false },
      ],
    })

    expect(badge).toBe('SOLD_OUT')
  })

  it('does not show a DIGITAL badge when legacy digital product has in-stock inventory', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
        fulfillmentType: 'DIGITAL',
      },
      variants: [{ inventory: 5, continueSellingWhenOutOfStock: false }],
    })

    expect(badge).toBeNull()
  })

  it('shows BACKORDER for legacy digital product when stock is zero and continue selling is enabled', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
        fulfillmentType: 'DIGITAL',
      },
      variants: [{ inventory: 0, continueSellingWhenOutOfStock: true }],
    })

    expect(badge).toBe('BACKORDER')
  })

  it('shows SOLD_OUT for legacy digital product when stock is zero and continue selling is disabled', () => {
    const badge = getProductAvailabilityBadge({
      product: {
        salesMode: 'STANDARD',
        fulfillmentType: 'DIGITAL',
      },
      variants: [{ inventory: 0, continueSellingWhenOutOfStock: false }],
    })

    expect(badge).toBe('SOLD_OUT')
  })

  it('marks variant inventory as ready when any variant has positive inventory', () => {
    const readiness = getVariantInventoryReadiness([
      { inventory: 3, continueSellingWhenOutOfStock: false },
      { inventory: 0, continueSellingWhenOutOfStock: false },
    ])

    expect(readiness.hasPositiveInventory).toBe(true)
    expect(readiness.hasBackorderVariant).toBe(false)
    expect(readiness.backorderOnly).toBe(false)
    expect(readiness.inventoryReady).toBe(true)
  })

  it('marks variant inventory as ready and backorder-only when inventory is zero but continue selling exists', () => {
    const readiness = getVariantInventoryReadiness([
      { inventory: 0, continueSellingWhenOutOfStock: false },
      { inventory: 0, continueSellingWhenOutOfStock: true },
    ])

    expect(readiness.hasPositiveInventory).toBe(false)
    expect(readiness.hasBackorderVariant).toBe(true)
    expect(readiness.backorderOnly).toBe(true)
    expect(readiness.inventoryReady).toBe(true)
  })

  it('marks variant inventory as not ready when inventory is zero and continue selling is disabled', () => {
    const readiness = getVariantInventoryReadiness([
      { inventory: 0, continueSellingWhenOutOfStock: false },
      { inventory: 0, continueSellingWhenOutOfStock: false },
    ])

    expect(readiness.hasPositiveInventory).toBe(false)
    expect(readiness.hasBackorderVariant).toBe(false)
    expect(readiness.backorderOnly).toBe(false)
    expect(readiness.inventoryReady).toBe(false)
  })

  it('uses backorder availability message without digital delivery promises', () => {
    const message = getAvailabilityMessage({
      product: {},
      badge: 'BACKORDER',
    })

    expect(message).toBe('Available on backorder.')
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

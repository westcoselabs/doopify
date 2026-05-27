import { describe, expect, it } from 'vitest'

import { evaluateProductReadiness } from './product-readiness.service'

describe('evaluateProductReadiness', () => {
  it('marks active physical products with price/inventory/weight/media as ready', () => {
    const readiness = evaluateProductReadiness({
      status: 'ACTIVE',
      salesMode: 'STANDARD',
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [
        {
          priceCents: 2500,
          inventory: 10,
          continueSellingWhenOutOfStock: false,
          weight: 1.2,
        },
      ],
    })

    expect(readiness.state).toBe('ready')
  })

  it('returns needs_price when no variant has a valid non-zero price', () => {
    const readiness = evaluateProductReadiness({
      status: 'ACTIVE',
      salesMode: 'STANDARD',
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [
        {
          priceCents: 0,
          inventory: 4,
          continueSellingWhenOutOfStock: false,
          weight: 1,
        },
      ],
    })

    expect(readiness.state).toBe('needs_price')
  })

  it('returns needs_weight for active physical products with invalid variant weight', () => {
    const readiness = evaluateProductReadiness({
      status: 'ACTIVE',
      salesMode: 'STANDARD',
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [
        {
          priceCents: 1800,
          inventory: 5,
          continueSellingWhenOutOfStock: false,
          weight: null,
        },
      ],
    })

    expect(readiness.state).toBe('needs_weight')
  })

  it('returns draft for non-active products', () => {
    const readiness = evaluateProductReadiness({
      status: 'DRAFT',
      salesMode: 'STANDARD',
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [
        {
          priceCents: 1200,
          inventory: 3,
          continueSellingWhenOutOfStock: false,
          weight: 1,
        },
      ],
    })

    expect(readiness.state).toBe('draft')
  })

  it('keeps coming-soon products visible but not purchasable', () => {
    const readiness = evaluateProductReadiness(
      {
        status: 'ACTIVE',
        salesMode: 'COMING_SOON',
        availableForPurchaseAt: '2099-01-01T00:00:00.000Z',
        fulfillmentType: 'PHYSICAL',
        media: [{ id: 'media_1' }],
        variants: [
          {
            priceCents: 2200,
            inventory: 8,
            continueSellingWhenOutOfStock: false,
            weight: 1,
          },
        ],
      },
      new Date('2026-05-21T00:00:00.000Z')
    )

    expect(readiness.state).toBe('coming_soon')
    expect(readiness.purchasable).toBe(false)
  })

  it('keeps backorder-only products inventory-ready under existing rules', () => {
    const readiness = evaluateProductReadiness({
      status: 'ACTIVE',
      salesMode: 'STANDARD',
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [
        {
          priceCents: 1900,
          inventory: 0,
          continueSellingWhenOutOfStock: true,
          weight: 1,
        },
      ],
    })

    expect(readiness.state).toBe('ready')
    expect(readiness.backorderOnly).toBe(true)
    expect(readiness.inventoryReady).toBe(true)
  })
})


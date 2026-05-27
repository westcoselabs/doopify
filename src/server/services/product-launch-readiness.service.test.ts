import { describe, expect, it } from 'vitest'

import { evaluateProductLaunchReadiness } from './product-launch-readiness.service'

describe('evaluateProductLaunchReadiness', () => {
  it('treats backorder-only purchasable products as inventory-ready', () => {
    const facts = evaluateProductLaunchReadiness([
      {
        id: 'prod_backorder',
        title: 'Backorder Product',
        salesMode: 'STANDARD',
        fulfillmentType: 'PHYSICAL',
        media: [],
        variants: [
          {
            priceCents: 2500,
            inventory: 0,
            continueSellingWhenOutOfStock: true,
            weight: 1,
          },
        ],
      },
    ])

    expect(facts.activeProductCount).toBe(1)
    expect(facts.activeProductsInventoryReady).toBe(1)
    expect(facts.activeProductsSellableOnBackorder).toBe(1)
    expect(facts.activeProductsWithInventory).toBe(0)
  })

  it('does not count coming-soon products as purchasable inventory-ready products', () => {
    const facts = evaluateProductLaunchReadiness(
      [
        {
          id: 'prod_coming_soon',
          title: 'Coming Soon Product',
          salesMode: 'COMING_SOON',
          availableForPurchaseAt: '2099-01-01T00:00:00.000Z',
          fulfillmentType: 'PHYSICAL',
          media: [],
          variants: [
            {
              priceCents: 1500,
              inventory: 10,
              continueSellingWhenOutOfStock: false,
              weight: 1,
            },
          ],
        },
      ],
      new Date('2026-05-20T00:00:00.000Z')
    )

    expect(facts.activeProductCount).toBe(1)
    expect(facts.activeComingSoonProductCount).toBe(1)
    expect(facts.activePurchasableProductCount).toBe(0)
    expect(facts.activeProductsInventoryReady).toBe(0)
    expect(facts.samples.comingSoon[0]?.id).toBe('prod_coming_soon')
  })

  it('counts presale products as sellable only when availability window allows', () => {
    const now = new Date('2026-05-20T00:00:00.000Z')
    const facts = evaluateProductLaunchReadiness(
      [
        {
          id: 'prod_presale_open',
          title: 'Presale Open',
          salesMode: 'PRESALE',
          presaleStartsAt: '2026-05-01T00:00:00.000Z',
          presaleEndsAt: '2026-06-01T00:00:00.000Z',
          fulfillmentType: 'PHYSICAL',
          media: [],
          variants: [
            {
              priceCents: 3000,
              inventory: 0,
              continueSellingWhenOutOfStock: true,
              weight: 1,
            },
          ],
        },
        {
          id: 'prod_presale_future',
          title: 'Presale Future',
          salesMode: 'PRESALE',
          presaleStartsAt: '2026-06-01T00:00:00.000Z',
          presaleEndsAt: '2026-07-01T00:00:00.000Z',
          fulfillmentType: 'PHYSICAL',
          media: [],
          variants: [
            {
              priceCents: 3000,
              inventory: 5,
              continueSellingWhenOutOfStock: false,
              weight: 1,
            },
          ],
        },
      ],
      now
    )

    expect(facts.activePresaleProductCount).toBe(1)
    expect(facts.activePresaleNotSellableProductCount).toBe(1)
    expect(facts.activePurchasableProductCount).toBe(1)
    expect(facts.samples.presaleNotSellable[0]?.id).toBe('prod_presale_future')
  })

  it('flags active physical products with missing variant weight', () => {
    const facts = evaluateProductLaunchReadiness([
      {
        id: 'prod_weight_missing',
        title: 'Missing Weight',
        salesMode: 'STANDARD',
        fulfillmentType: 'PHYSICAL',
        media: [],
        variants: [
          {
            priceCents: 2200,
            inventory: 3,
            continueSellingWhenOutOfStock: false,
            weight: null,
          },
        ],
      },
      {
        id: 'prod_digital',
        title: 'Digital Product',
        salesMode: 'STANDARD',
        fulfillmentType: 'DIGITAL',
        media: [],
        variants: [
          {
            priceCents: 2200,
            inventory: 3,
            continueSellingWhenOutOfStock: false,
            weight: null,
          },
        ],
      },
    ])

    expect(facts.activePhysicalProductsMissingWeight).toBe(1)
    expect(facts.samples.missingWeight[0]?.id).toBe('prod_weight_missing')
  })
})

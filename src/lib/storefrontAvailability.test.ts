import { describe, expect, it } from 'vitest'

import { getStorefrontBadgeText } from './storefrontAvailability'

describe('storefront availability badge text', () => {
  it('does not expose Digital badge text for deferred digital fulfillment', () => {
    const label = getStorefrontBadgeText({
      availability: {
        badge: 'DIGITAL',
      },
    })

    expect(label).toBeNull()
  })

  it('maps standard availability badges to storefront-safe labels', () => {
    expect(
      getStorefrontBadgeText({
        availability: { badge: 'BACKORDER' },
      })
    ).toBe('Backorder')

    expect(
      getStorefrontBadgeText({
        availability: { badge: 'SOLD_OUT' },
      })
    ).toBe('Sold out')
  })

  it('uses custom badge text only for coming soon and presale', () => {
    expect(
      getStorefrontBadgeText({
        availability: {
          badge: 'COMING_SOON',
          storefrontBadgeText: 'Launching Friday',
        },
      })
    ).toBe('Launching Friday')

    expect(
      getStorefrontBadgeText({
        availability: {
          badge: 'PRESALE',
          storefrontBadgeText: 'Ships in June',
        },
      })
    ).toBe('Ships in June')
  })
})

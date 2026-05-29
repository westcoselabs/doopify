import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildCheckoutPricing,
  buildCheckoutPricingWithDecisions,
  buildCheckoutPricingWithDecisionsCents,
  calculateShipping,
  calculateTax,
} from './pricing'

describe('buildCheckoutPricingWithDecisionsCents', () => {
  it('calculates checkout totals with integer cents only', () => {
    const pricing = buildCheckoutPricingWithDecisionsCents(
      [
        { priceCents: 205, quantity: 2 },
        { priceCents: 1999, quantity: 1 },
      ],
      null,
      {
        shippingAddress: { country: 'US', province: 'CA' },
        storeCountry: 'US',
        shippingRates: { domesticCents: 999, internationalCents: 1999 },
        taxRules: [
          {
            countryCode: 'US',
            provinceCode: 'CA',
            rate: 0.0825,
            priority: 10,
            isActive: true,
          },
        ],
      }
    )

    expect(pricing).toMatchObject({
      subtotalCents: 2409,
      shippingAmountCents: 999,
      taxAmountCents: 0,
      discountAmountCents: 0,
      totalCents: 3408,
      taxDecision: {
        source: 'none',
      },
    })
  })

  it('treats fixed discount value as cents instead of guessing dollars from number size', () => {
    const pricing = buildCheckoutPricingWithDecisionsCents(
      [{ priceCents: 205, quantity: 1 }],
      null,
      {
        shippingAddress: { country: 'US' },
        storeCountry: 'US',
        shippingRates: { domesticCents: 0, internationalCents: 0 },
        taxRules: [],
        discount: {
          id: 'discount_1',
          code: 'TWO_OFF',
          title: '$2.00 off',
          type: 'CODE',
          method: 'FIXED_AMOUNT',
          value: 200,
          status: 'ACTIVE',
        },
      }
    )

    expect(pricing).toMatchObject({
      subtotalCents: 205,
      discountAmountCents: 200,
      totalCents: 5,
      appliedDiscount: {
        discountId: 'discount_1',
        amountCents: 200,
      },
    })
  })

  it('rejects decimal money values in the cents-only pricing core', () => {
    expect(() =>
      buildCheckoutPricingWithDecisionsCents([{ priceCents: 2.05, quantity: 1 }], null)
    ).toThrow('Line price must be a non-negative integer cents value')
  })

  it('applies additional subtotal promotion discounts before tax using server-owned cents math', () => {
    const pricing = buildCheckoutPricingWithDecisionsCents([{ priceCents: 10000, quantity: 1 }], null, {
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      shippingRates: { domesticCents: 0, internationalCents: 0 },
      taxSettings: {
        enabled: true,
        strategy: 'MANUAL',
        defaultTaxRateBps: 1000,
        taxShipping: false,
        pricesIncludeTax: false,
      },
      additionalSubtotalDiscountCents: 2000,
    })

    expect(pricing).toMatchObject({
      subtotalCents: 10000,
      promotionDiscountAmountCents: 2000,
      codeDiscountAmountCents: 0,
      discountAmountCents: 2000,
      taxAmountCents: 800,
      totalCents: 8800,
    })
  })

  it('applies minimum-order validation using cents', () => {
    expect(() =>
      buildCheckoutPricingWithDecisionsCents([{ priceCents: 2000, quantity: 1 }], null, {
        discount: {
          id: 'minimum',
          code: 'MINIMUM',
          title: 'Minimum',
          type: 'CODE',
          method: 'PERCENTAGE',
          value: 10,
          status: 'ACTIVE',
          minimumOrderCents: 5000,
        },
      })
    ).toThrow('Minimum order of $50.00 required')
  })

  it('uses configured shipping-zone tiers and manual tax settings in cents', () => {
    const pricing = buildCheckoutPricingWithDecisionsCents([{ priceCents: 6000, quantity: 2 }], 50000, {
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      shippingRates: {
        domesticCents: 1200,
        internationalCents: 2500,
      },
      shippingZones: [
        {
          id: 'zone_domestic',
          name: 'Domestic',
          countryCode: 'US',
          priority: 200,
          rates: [
            {
              id: 'rate_domestic_flat',
              name: 'Domestic flat',
              method: 'FLAT',
              amountCents: 2000,
              priority: 200,
            },
          ],
        },
        {
          id: 'zone_ca',
          name: 'California',
          countryCode: 'US',
          provinceCode: 'CA',
          priority: 10,
          rates: [
            {
              id: 'rate_ca_low',
              name: 'CA low subtotal',
              method: 'SUBTOTAL_TIER',
              amountCents: 1000,
              minSubtotalCents: 0,
              maxSubtotalCents: 9999,
              priority: 20,
            },
            {
              id: 'rate_ca_high',
              name: 'CA high subtotal',
              method: 'SUBTOTAL_TIER',
              amountCents: 400,
              minSubtotalCents: 10000,
              maxSubtotalCents: 999900,
              priority: 10,
            },
          ],
        },
      ],
      taxRules: [
        {
          id: 'tax_us',
          name: 'US fallback',
          countryCode: 'US',
          rate: 0.06,
          priority: 100,
        },
        {
          id: 'tax_us_ca',
          name: 'US CA',
          countryCode: 'US',
          provinceCode: 'CA',
          rate: 0.0825,
          priority: 10,
        },
      ],
      taxSettings: {
        enabled: true,
        strategy: 'MANUAL',
        defaultTaxRateBps: 825,
      },
    })

    expect(pricing).toMatchObject({
      subtotalCents: 12000,
      shippingAmountCents: 400,
      taxAmountCents: 990,
      discountAmountCents: 0,
      totalCents: 13390,
      shippingDecision: {
        source: 'zone',
        amountCents: 400,
        zoneId: 'zone_ca',
        rateId: 'rate_ca_high',
      },
      taxDecision: {
        source: 'rule',
        rate: 0.0825,
        amountCents: 990,
      },
    })
  })
})

describe('checkout pricing display wrappers', () => {
  it('returns both cents and display dollars without changing the cents source of truth', () => {
    expect(
      buildCheckoutPricing([{ priceCents: 205, quantity: 1 }], null, {
        shippingRates: { domesticCents: 999, internationalCents: 1999 },
      })
    ).toMatchObject({
      subtotalCents: 205,
      shippingAmountCents: 999,
      taxAmountCents: 0,
      discountAmountCents: 0,
      totalCents: 1204,
      subtotal: 2.05,
      shippingAmount: 9.99,
      taxAmount: 0,
      discountAmount: 0,
      total: 12.04,
    })
  })

  it('adds display amounts to decisions for admin/storefront presentation', () => {
    expect(
      buildCheckoutPricingWithDecisions([{ priceCents: 10000, quantity: 1 }], 50000, {
        shippingAddress: { country: 'US', province: 'CA' },
        storeCountry: 'US',
        shippingRates: { domesticCents: 1200, internationalCents: 2500 },
        taxSettings: {
          enabled: true,
          strategy: 'MANUAL',
          defaultTaxRateBps: 825,
        },
      })
    ).toMatchObject({
      subtotalCents: 10000,
      totalCents: 12025,
      subtotal: 100,
      total: 120.25,
      shippingDecision: {
        source: 'fallback',
        amountCents: 1200,
        amount: 12,
      },
      taxDecision: {
        source: 'rule',
        amountCents: 825,
        amount: 8.25,
      },
    })
  })
})

describe('shipping and tax helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns fallback warning when an explicit fallback shipping rate is provided and no active zone rate matches', () => {
    const shipping = calculateShipping({
      subtotalCents: 5000,
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      shippingRates: { domesticCents: 900, internationalCents: 2500 },
      shippingZones: [
        {
          id: 'zone_1',
          name: 'California',
          countryCode: 'US',
          provinceCode: 'CA',
          rates: [
            {
              id: 'rate_1',
              name: 'Inactive',
              method: 'FLAT',
              amountCents: 500,
              isActive: false,
            },
          ],
        },
      ],
    })

    expect(shipping).toMatchObject({
      source: 'fallback',
      amountCents: 900,
    })
    expect(shipping.warning).toContain('No configured shipping rate matched')
  })

  it('does not silently invent fallback shipping when no explicit fallback rate is provided', () => {
    const shipping = calculateShipping({
      subtotalCents: 5000,
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      shippingRates: null,
      shippingZones: [
        {
          id: 'zone_1',
          name: 'California',
          countryCode: 'US',
          provinceCode: 'CA',
          rates: [
            {
              id: 'rate_1',
              name: 'Inactive',
              method: 'FLAT',
              amountCents: 500,
              isActive: false,
            },
          ],
        },
      ],
    })

    expect(shipping).toMatchObject({
      source: 'none',
      amountCents: 0,
      availableRates: [],
    })
    expect(shipping.warning).toContain('No configured shipping rate matched')
  })

  it('uses selected shipping rate id when multiple rates are available', () => {
    const shipping = calculateShipping({
      subtotalCents: 5000,
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      shippingRates: { domesticCents: 900, internationalCents: 2500 },
      shippingZones: [
        {
          id: 'zone_1',
          name: 'California',
          countryCode: 'US',
          provinceCode: 'CA',
          rates: [
            {
              id: 'rate_standard',
              name: 'Standard',
              method: 'FLAT',
              amountCents: 900,
              isActive: true,
            },
            {
              id: 'rate_express',
              name: 'Express',
              method: 'FLAT',
              amountCents: 1900,
              isActive: true,
            },
          ],
        },
      ],
      selectedRateId: 'rate_express',
    })

    expect(shipping).toMatchObject({
      source: 'zone',
      rateId: 'rate_express',
      amountCents: 1900,
    })
  })

  it('returns zero tax when manual tax is disabled', () => {
    const tax = calculateTax({
      taxableSubtotalCents: 10000,
      shippingAmountCents: 1000,
      taxSettings: {
        enabled: false,
        strategy: 'MANUAL',
        defaultTaxRateBps: 825,
        taxShipping: true,
      },
    })

    expect(tax).toMatchObject({
      source: 'none',
      amountCents: 0,
    })
  })

  it('does not silently apply tax when tax settings are absent', () => {
    const tax = calculateTax({
      taxableSubtotalCents: 10000,
      shippingAddress: { country: 'US', province: 'CA' },
    })

    expect(tax).toMatchObject({
      source: 'none',
      amountCents: 0,
      label: 'Tax disabled',
    })
  })

  it('does not use legacy tax rates in production unless dev fallbacks are explicitly allowed', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const tax = calculateTax({
      taxableSubtotalCents: 10000,
      shippingAddress: { country: 'US', province: 'CA' },
      storeCountry: 'US',
      taxRates: { domestic: 0.0825, international: 0 },
      taxSettings: {
        enabled: true,
        strategy: 'MANUAL',
        defaultTaxRateBps: 0,
      },
    })

    expect(tax).toMatchObject({
      source: 'rule',
      amountCents: 0,
      rateBps: 0,
    })
  })

  it('calculates manual tax and optionally taxes shipping', () => {
    const tax = calculateTax({
      taxableSubtotalCents: 10000,
      shippingAmountCents: 1000,
      taxSettings: {
        enabled: true,
        strategy: 'MANUAL',
        defaultTaxRateBps: 1000,
        taxShipping: true,
      },
    })

    expect(tax).toMatchObject({
      source: 'rule',
      rateBps: 1000,
      taxableAmountCents: 11000,
      amountCents: 1100,
    })
  })

  it('supports tax-inclusive manual pricing without adding tax twice', () => {
    const pricing = buildCheckoutPricingWithDecisionsCents([{ priceCents: 11000, quantity: 1 }], null, {
      shippingAddress: { country: 'US' },
      shippingRates: { domesticCents: 0, internationalCents: 0 },
      taxSettings: {
        enabled: true,
        strategy: 'MANUAL',
        defaultTaxRateBps: 1000,
        taxShipping: false,
        pricesIncludeTax: true,
      },
    })

    expect(pricing.taxAmountCents).toBe(1000)
    expect(pricing.totalCents).toBe(11000)
  })
})

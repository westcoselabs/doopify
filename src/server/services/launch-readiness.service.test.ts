import { describe, expect, it } from 'vitest'

import {
  buildLaunchReadinessReport,
  type LaunchReadinessFacts,
} from './launch-readiness.service'

function baseFacts(): LaunchReadinessFacts {
  return {
    storeConfigured: true,
    storeContactConfigured: true,
    stripeVerificationStatus: 'verified',
    stripeSource: 'db',
    stripeVerified: true,
    stripeHasSecretKey: true,
    stripeHasPublishableKey: true,
    stripeHasWebhookSecret: true,
    stripeWebhookDeliveryReceived: true,
    shippingProviderVerificationStatus: 'verified',
    shippingRequired: true,
    shippingMode: 'MANUAL',
    shippingCanUseManualRates: true,
    shippingCanUseLiveRates: false,
    taxEnabled: false,
    taxHasRate: false,
    activeProductCount: 2,
    activePurchasableProductCount: 2,
    activeProductsWithValidPrice: 2,
    activePurchasableProductsWithValidPrice: 2,
    activeProductsMissingValidPrice: 0,
    activeProductsWithInventory: 2,
    activeProductsSellableOnBackorder: 0,
    activeProductsInventoryReady: 2,
    activeProductsWithoutSellableInventory: 0,
    activeComingSoonProductCount: 0,
    activePresaleProductCount: 0,
    activePresaleNotSellableProductCount: 0,
    activePhysicalProductsMissingWeight: 0,
    activeProductsWithMedia: 2,
    samples: {
      missingPrice: [],
      missingWeight: [],
      unsellableInventory: [],
      comingSoon: [],
      presaleNotSellable: [],
    },
    storefrontUrlConfigured: true,
    storefrontUrlIssue: null,
    storefrontUrlMessage: 'NEXT_PUBLIC_STORE_URL is configured.',
    emailVerificationStatus: 'verified',
    emailProviderSource: 'db',
    webhookRetrySecretPresent: true,
    recentPaidOrderExists: true,
  }
}

describe('buildLaunchReadinessReport', () => {
  it('returns launchReady true when all required checks pass', () => {
    const report = buildLaunchReadinessReport(baseFacts(), {
      checkedAt: '2026-05-20T00:00:00.000Z',
    })

    expect(report.launchReady).toBe(true)
    expect(report.blockerCount).toBe(0)
    expect(report.summary.launchReady).toBe(true)
    expect(report.summary.blockers).toBe(0)
    expect(report.summary.ready).toBeGreaterThan(0)
    expect(report.summary.checkedAt).toBe('2026-05-20T00:00:00.000Z')
  })

  it('returns blocker when Stripe is missing', () => {
    const facts = baseFacts()
    facts.stripeSource = 'none'
    facts.stripeVerified = false
    facts.stripeHasSecretKey = false
    facts.stripeHasPublishableKey = false

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    expect(stripe?.status).toBe('needs_setup')
    expect(stripe?.severity).toBe('blocker')
    expect(report.blockerCount).toBeGreaterThan(0)
  })

  it('returns blocker when shipping is not configured', () => {
    const facts = baseFacts()
    facts.shippingCanUseManualRates = false
    facts.shippingCanUseLiveRates = false

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const shipping = report.checks.find((c) => c.id === 'shipping')
    expect(shipping?.status).toBe('needs_setup')
    expect(shipping?.severity).toBe('blocker')
  })

  it('marks tax as skipped when taxEnabled is false', () => {
    const report = buildLaunchReadinessReport(baseFacts())

    const tax = report.checks.find((c) => c.id === 'tax')
    expect(tax?.status).toBe('skipped')
    expect(tax?.optional).toBe(false)
    expect(report.skippedCount).toBeGreaterThan(0)
  })

  it('marks tax as ready when taxEnabled and has a rate', () => {
    const facts = baseFacts()
    facts.taxEnabled = true
    facts.taxHasRate = true

    const report = buildLaunchReadinessReport(facts)

    const tax = report.checks.find((c) => c.id === 'tax')
    expect(tax?.status).toBe('ready')
  })

  it('marks tax as needs_setup when taxEnabled but no rate', () => {
    const facts = baseFacts()
    facts.taxEnabled = true
    facts.taxHasRate = false

    const report = buildLaunchReadinessReport(facts)

    const tax = report.checks.find((c) => c.id === 'tax')
    expect(tax?.status).toBe('needs_setup')
    expect(report.launchReady).toBe(false)
  })

  it('returns launchReady false when no active products', () => {
    const facts = baseFacts()
    facts.activeProductCount = 0
    facts.activePurchasableProductCount = 0
    facts.activeProductsWithValidPrice = 0
    facts.activePurchasableProductsWithValidPrice = 0
    facts.activeProductsMissingValidPrice = 0
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 0
    facts.activeProductsInventoryReady = 0
    facts.activeProductsWithoutSellableInventory = 0
    facts.activeProductsWithMedia = 0

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const products = report.checks.find((c) => c.id === 'products-active')
    expect(products?.status).toBe('needs_setup')
  })

  it('returns blocker when active products exist but none have inventory and no backorder', () => {
    const facts = baseFacts()
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 0
    facts.activeProductsInventoryReady = 0
    facts.activeProductsWithoutSellableInventory = 2

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')
    expect(inventory?.status).toBe('needs_setup')
    expect(inventory?.severity).toBe('blocker')
    expect(inventory?.ctaRoute).toBe('/products?readiness=needs_inventory')
  })

  it('marks inventory as warning when inventory is zero but continue-selling is enabled', () => {
    const facts = baseFacts()
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 2
    facts.activeProductsInventoryReady = 2
    facts.activeProductsWithoutSellableInventory = 0

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(true)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')
    expect(inventory?.status).toBe('warning')
    expect(inventory?.severity).toBe('warning')
    expect(inventory?.summary).toContain('Inventory is zero, but continue-selling is enabled')
    expect(report.summary.warnings).toBeGreaterThan(0)
  })

  it('reports mixed inventory and backorder coverage accurately', () => {
    const facts = baseFacts()
    facts.activeProductsWithInventory = 1
    facts.activeProductsSellableOnBackorder = 1
    facts.activeProductsInventoryReady = 2

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(true)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')
    expect(inventory?.status).toBe('ready')
    expect(inventory?.summary).toContain('1 purchasable product(s) have available inventory')
    expect(inventory?.summary).toContain('1 purchasable product(s) are sellable with zero inventory')
  })

  it('keeps email as optional when email provider is not configured', () => {
    const facts = baseFacts()
    facts.emailProviderSource = 'none'

    const report = buildLaunchReadinessReport(facts)

    const email = report.checks.find((c) => c.id === 'email-provider')
    expect(email?.status).toBe('optional')
    expect(email?.optional).toBe(true)
    expect(report.launchReady).toBe(true)
  })

  it('marks webhook retry secret as warning without blocking launch', () => {
    const facts = baseFacts()
    facts.webhookRetrySecretPresent = false

    const report = buildLaunchReadinessReport(facts)

    const jobs = report.checks.find((c) => c.id === 'webhook-jobs')
    expect(jobs?.status).toBe('warning')
    expect(jobs?.optional).toBe(true)
    expect(report.launchReady).toBe(true)
  })

  it('marks product media as optional when no media exists', () => {
    const facts = baseFacts()
    facts.activeProductsWithMedia = 0

    const report = buildLaunchReadinessReport(facts)

    const media = report.checks.find((c) => c.id === 'products-media')
    expect(media?.status).toBe('optional')
    expect(media?.optional).toBe(true)
    expect(report.launchReady).toBe(true)
  })

  it('marks stripe as warning when DB credentials are saved but not verified', () => {
    const facts = baseFacts()
    facts.stripeSource = 'db'
    facts.stripeVerified = false
    facts.stripeVerificationStatus = 'configured'

    const report = buildLaunchReadinessReport(facts)

    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    expect(stripe?.status).toBe('warning')
    expect(stripe?.severity).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('marks stripe as needs_setup when env fallback is active', () => {
    const facts = baseFacts()
    facts.stripeSource = 'env'
    facts.stripeVerified = false

    const report = buildLaunchReadinessReport(facts)

    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    expect(stripe?.status).toBe('needs_setup')
    expect(stripe?.summary).toContain('environment fallback')
  })

  it('marks stripe as warning when saved config exists but verification is temporarily unavailable', () => {
    const facts = baseFacts()
    facts.stripeRuntimeUnavailable = true
    facts.stripeSource = 'db'
    facts.stripeVerified = false
    facts.stripeVerificationStatus = 'verification_unavailable'

    const report = buildLaunchReadinessReport(facts)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    const webhook = report.checks.find((c) => c.id === 'stripe-webhook-confidence')

    expect(stripe?.status).toBe('warning')
    expect(stripe?.severity).toBe('warning')
    expect(webhook?.status).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('uses soft "Open payments" CTA copy when Stripe runtime is unavailable but configured', () => {
    const facts = baseFacts()
    facts.stripeRuntimeUnavailable = true
    facts.stripeSource = 'db'
    facts.stripeVerified = false
    facts.stripeVerificationStatus = 'verification_unavailable'

    const report = buildLaunchReadinessReport(facts)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    const webhook = report.checks.find((c) => c.id === 'stripe-webhook-confidence')

    expect(stripe?.ctaLabel).toBe('Open payments')
    expect(stripe?.ctaLabel).not.toBe('Configure payments')
    expect(stripe?.summary).toContain('temporarily unavailable')
    expect(stripe?.summary).not.toMatch(/not configured/i)
    expect(stripe?.severity).not.toBe('blocker')

    expect(webhook?.ctaLabel).toBe('Open payments')
    expect(webhook?.ctaLabel).not.toBe('Configure payments')
    expect(webhook?.summary).toContain('temporarily unavailable')
    expect(webhook?.severity).not.toBe('blocker')

    expect(report.launchReady).toBe(true)
    expect(report.blockerCount).toBe(0)
  })

  it('still flags Stripe as a blocker when keys are genuinely missing (not a timeout)', () => {
    const facts = baseFacts()
    facts.stripeRuntimeUnavailable = false
    facts.stripeSource = 'none'
    facts.stripeVerified = false
    facts.stripeHasSecretKey = false
    facts.stripeHasPublishableKey = false
    facts.stripeHasWebhookSecret = false

    const report = buildLaunchReadinessReport(facts)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')

    expect(stripe?.status).toBe('needs_setup')
    expect(stripe?.severity).toBe('blocker')
    expect(stripe?.ctaLabel).toBe('Configure payments')
    expect(report.launchReady).toBe(false)
  })

  it('keeps email optional when env fallback is active', () => {
    const facts = baseFacts()
    facts.emailProviderSource = 'env'
    facts.emailVerificationStatus = 'verification_unavailable'

    const report = buildLaunchReadinessReport(facts)

    const email = report.checks.find((c) => c.id === 'email-provider')
    expect(email?.status).toBe('warning')
    expect(email?.summary).toContain('environment fallback')
  })

  it('marks shipping as warning when shipping is configured but verification is temporarily unavailable', () => {
    const facts = baseFacts()
    facts.shippingStatusUnavailable = true
    facts.shippingCanUseManualRates = true
    facts.shippingCanUseLiveRates = false
    facts.shippingProviderVerificationStatus = 'verification_unavailable'

    const report = buildLaunchReadinessReport(facts)
    const shipping = report.checks.find((c) => c.id === 'shipping')

    expect(shipping?.status).toBe('warning')
    expect(shipping?.severity).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('uses soft "Open shipping" CTA copy when shipping status is unavailable but configured', () => {
    const facts = baseFacts()
    facts.shippingStatusUnavailable = true
    facts.shippingCanUseManualRates = true
    facts.shippingCanUseLiveRates = false
    facts.shippingProviderVerificationStatus = 'verification_unavailable'

    const report = buildLaunchReadinessReport(facts)
    const shipping = report.checks.find((c) => c.id === 'shipping')

    expect(shipping?.ctaLabel).toBe('Open shipping')
    expect(shipping?.ctaLabel).not.toBe('Configure shipping')
    expect(shipping?.summary).toContain('temporarily unavailable')
    expect(shipping?.summary).not.toMatch(/no shipping method/i)
    expect(shipping?.severity).not.toBe('blocker')

    expect(report.launchReady).toBe(true)
    expect(report.blockerCount).toBe(0)
  })

  it('still flags shipping as a blocker when shipping is genuinely not configured (not a timeout)', () => {
    const facts = baseFacts()
    facts.shippingStatusUnavailable = false
    facts.shippingCanUseManualRates = false
    facts.shippingCanUseLiveRates = false
    facts.shippingMode = null
    facts.shippingProviderVerificationStatus = 'needs_setup'

    const report = buildLaunchReadinessReport(facts)
    const shipping = report.checks.find((c) => c.id === 'shipping')

    expect(shipping?.status).toBe('needs_setup')
    expect(shipping?.severity).toBe('blocker')
    expect(shipping?.ctaLabel).toBe('Configure shipping')
    expect(report.launchReady).toBe(false)
  })

  it('marks shipping as optional when there are no physical products requiring shipping', () => {
    const facts = baseFacts()
    facts.shippingRequired = false
    facts.shippingCanUseManualRates = false
    facts.shippingCanUseLiveRates = false

    const report = buildLaunchReadinessReport(facts)
    const shipping = report.checks.find((c) => c.id === 'shipping')

    expect(shipping?.status).toBe('optional')
    expect(shipping?.severity).toBe('info')
    expect(report.launchReady).toBe(true)
  })

  it('marks stripe as warning when saved config exists but verification failed', () => {
    const facts = baseFacts()
    facts.stripeVerificationStatus = 'needs_attention'
    facts.stripeVerified = false

    const report = buildLaunchReadinessReport(facts)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')

    expect(stripe?.status).toBe('warning')
    expect(stripe?.severity).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('adds operations warning when email is configured but job health is unknown', () => {
    const facts = baseFacts()
    facts.emailProviderSource = 'db'
    facts.emailVerificationStatus = 'verified'

    const report = buildLaunchReadinessReport(facts, {
      signals: {
        emailJobHealthLevel: 'unknown',
        runnerHealth: 'unknown',
        checkedAt: '2026-05-20T00:00:00.000Z',
      },
    })
    const emailJobs = report.checks.find((c) => c.id === 'email-job-health')

    expect(emailJobs?.status).toBe('warning')
    expect(emailJobs?.severity).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('marks storefront URL as blocker when placeholder is configured', () => {
    const facts = baseFacts()
    facts.storefrontUrlConfigured = false
    facts.storefrontUrlIssue = 'placeholder'
    facts.storefrontUrlMessage = 'NEXT_PUBLIC_STORE_URL is still using a placeholder domain.'

    const report = buildLaunchReadinessReport(facts)
    const storefront = report.checks.find((c) => c.id === 'storefront-settings')

    expect(storefront?.status).toBe('needs_setup')
    expect(storefront?.severity).toBe('blocker')
    expect(report.launchReady).toBe(false)
  })

  it('marks webhook confidence as warning when secret exists but no processed delivery', () => {
    const facts = baseFacts()
    facts.stripeWebhookDeliveryReceived = false

    const report = buildLaunchReadinessReport(facts)
    const webhook = report.checks.find((c) => c.id === 'stripe-webhook-confidence')

    expect(webhook?.status).toBe('warning')
    expect(webhook?.severity).toBe('warning')
    expect(report.launchReady).toBe(true)
  })

  it('keeps test-order as warning when no recent paid order exists', () => {
    const facts = baseFacts()
    facts.recentPaidOrderExists = false

    const report = buildLaunchReadinessReport(facts)
    const testOrder = report.checks.find((c) => c.id === 'test-order')

    expect(testOrder?.status).toBe('warning')
    expect(testOrder?.optional).toBe(true)
    expect(report.launchReady).toBe(true)
  })

  it('flags physical product weight gaps as warning with sample metadata', () => {
    const facts = baseFacts()
    facts.activePhysicalProductsMissingWeight = 1
    facts.samples.missingWeight = [{ id: 'prod_weight', title: 'Weight Missing Product' }]

    const report = buildLaunchReadinessReport(facts)
    const weight = report.checks.find((c) => c.id === 'products-weight')

    expect(weight?.status).toBe('warning')
    expect(weight?.optional).toBe(true)
    expect(weight?.summary).toContain('missing valid variant weight')
    expect(weight?.metadata).toEqual(
      expect.objectContaining({
        affectedCount: 1,
      })
    )
  })

  it('fails inventory readiness when products are active but all are coming soon', () => {
    const facts = baseFacts()
    facts.activePurchasableProductCount = 0
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 0
    facts.activeProductsInventoryReady = 0
    facts.activeProductsWithoutSellableInventory = 0
    facts.activeComingSoonProductCount = 2
    facts.samples.comingSoon = [
      { id: 'prod_coming_soon_1', title: 'Soon 1' },
      { id: 'prod_coming_soon_2', title: 'Soon 2' },
    ]

    const report = buildLaunchReadinessReport(facts)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')

    expect(inventory?.status).toBe('needs_setup')
    expect(inventory?.summary).toContain('coming soon')
    expect(inventory?.ctaRoute).toBe('/products?readiness=coming_soon')
    expect(report.launchReady).toBe(false)
  })

  it('routes product price blockers to products filtered by readiness', () => {
    const facts = baseFacts()
    facts.activeProductsWithValidPrice = 0
    facts.activePurchasableProductsWithValidPrice = 0
    facts.activeProductsMissingValidPrice = 2

    const report = buildLaunchReadinessReport(facts)
    const pricing = report.checks.find((c) => c.id === 'products-price')

    expect(pricing?.status).toBe('needs_setup')
    expect(pricing?.ctaRoute).toBe('/products?readiness=needs_price')
  })

  it('keeps legacy counters and summary totals consistent', () => {
    const report = buildLaunchReadinessReport(baseFacts())

    const legacyTotal =
      report.readyCount +
      report.needsSetupCount +
      report.optionalCount +
      report.skippedCount
    expect(legacyTotal).toBe(report.checks.length)
    expect(report.summary.total).toBe(report.checks.length)
    expect(report.summary.ready).toBe(report.readyCount)
    expect(report.summary.blockers).toBe(report.blockerCount)
  })
})

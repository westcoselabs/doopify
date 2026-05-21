import { describe, expect, it } from 'vitest'

import {
  buildLaunchReadinessReport,
  type LaunchReadinessFacts,
} from './launch-readiness.service'

function baseFacts(): LaunchReadinessFacts {
  return {
    storeConfigured: true,
    storeContactConfigured: true,
    stripeSource: 'db',
    stripeVerified: true,
    stripeHasSecretKey: true,
    stripeHasPublishableKey: true,
    stripeHasWebhookSecret: true,
    shippingMode: 'MANUAL',
    shippingCanUseManualRates: true,
    shippingCanUseLiveRates: false,
    taxEnabled: false,
    taxHasRate: false,
    activeProductCount: 2,
    activeProductsWithValidPrice: 2,
    activeProductsWithInventory: 2,
    activeProductsSellableOnBackorder: 0,
    activeProductsInventoryReady: 2,
    activeProductsWithMedia: 2,
    storefrontUrlConfigured: true,
    emailProviderSource: 'db',
    webhookRetrySecretPresent: true,
  }
}

describe('buildLaunchReadinessReport', () => {
  it('returns launchReady true when all required checks pass', () => {
    const report = buildLaunchReadinessReport(baseFacts())

    expect(report.launchReady).toBe(true)
    expect(report.blockerCount).toBe(0)
    expect(report.readyCount).toBeGreaterThan(0)
  })

  it('returns launchReady false when Stripe is missing', () => {
    const facts = baseFacts()
    facts.stripeSource = 'none'
    facts.stripeVerified = false
    facts.stripeHasSecretKey = false
    facts.stripeHasPublishableKey = false

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    expect(stripe?.status).toBe('needs_setup')
    expect(report.blockerCount).toBeGreaterThan(0)
  })

  it('returns launchReady false when shipping is not configured', () => {
    const facts = baseFacts()
    facts.shippingCanUseManualRates = false
    facts.shippingCanUseLiveRates = false

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const shipping = report.checks.find((c) => c.id === 'shipping')
    expect(shipping?.status).toBe('needs_setup')
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
    facts.activeProductsWithValidPrice = 0
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 0
    facts.activeProductsInventoryReady = 0
    facts.activeProductsWithMedia = 0

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const products = report.checks.find((c) => c.id === 'products-active')
    expect(products?.status).toBe('needs_setup')
  })

  it('returns launchReady false when active products exist but none have inventory', () => {
    const facts = baseFacts()
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 0
    facts.activeProductsInventoryReady = 0

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(false)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')
    expect(inventory?.status).toBe('needs_setup')
  })

  it('marks inventory as ready with warning summary when inventory is zero but continue-selling is enabled', () => {
    const facts = baseFacts()
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 2
    facts.activeProductsInventoryReady = 2

    const report = buildLaunchReadinessReport(facts)

    expect(report.launchReady).toBe(true)
    const inventory = report.checks.find((c) => c.id === 'products-inventory')
    expect(inventory?.status).toBe('ready')
    expect(inventory?.summary).toContain('Inventory is zero, but continue-selling is enabled')
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
    expect(inventory?.summary).toContain('1 active product(s) have available inventory')
    expect(inventory?.summary).toContain('1 active product(s) are sellable with zero inventory')
  })

  it('does not block launch when email provider is not configured', () => {
    const facts = baseFacts()
    facts.emailProviderSource = 'none'

    const report = buildLaunchReadinessReport(facts)

    const email = report.checks.find((c) => c.id === 'email-provider')
    expect(email?.status).toBe('optional')
    expect(email?.optional).toBe(true)
    expect(report.launchReady).toBe(true)
  })

  it('does not block launch when webhook retry secret is missing', () => {
    const facts = baseFacts()
    facts.webhookRetrySecretPresent = false

    const report = buildLaunchReadinessReport(facts)

    const jobs = report.checks.find((c) => c.id === 'webhook-jobs')
    expect(jobs?.status).toBe('optional')
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

  it('marks stripe as needs_setup when DB credentials saved but not verified', () => {
    const facts = baseFacts()
    facts.stripeSource = 'db'
    facts.stripeVerified = false

    const report = buildLaunchReadinessReport(facts)

    const stripe = report.checks.find((c) => c.id === 'stripe-runtime')
    expect(stripe?.status).toBe('needs_setup')
    expect(report.launchReady).toBe(false)
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

  it('keeps email optional when env fallback is active', () => {
    const facts = baseFacts()
    facts.emailProviderSource = 'env'

    const report = buildLaunchReadinessReport(facts)

    const email = report.checks.find((c) => c.id === 'email-provider')
    expect(email?.status).toBe('optional')
    expect(email?.summary).toContain('environment fallback')
  })

  it('counts checks correctly', () => {
    const report = buildLaunchReadinessReport(baseFacts())

    const total = report.readyCount + report.needsSetupCount + report.optionalCount + report.skippedCount
    expect(total).toBe(report.checks.length)
  })
})

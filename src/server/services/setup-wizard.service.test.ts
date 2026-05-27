import { describe, expect, it } from 'vitest'

import {
  buildSetupWizardSteps,
  type SetupWizardFacts,
} from './setup-wizard.service'

function allMissingFacts(): SetupWizardFacts {
  return {
    ownerExists: false,
    storeNameConfigured: false,
    storeEmailConfigured: false,
    storeUrlReady: false,
    storeUrlIssue: 'missing',
    stripeSource: 'none',
    stripeVerified: false,
    stripeHasSecretKey: false,
    stripeHasPublishableKey: false,
    stripeHasWebhookSecret: false,
    stripeWebhookDeliveryReceived: false,
    shippingCanUseManualRates: false,
    shippingCanUseLiveRates: false,
    emailProviderSource: 'none',
    activeProductCount: 0,
    activePurchasableProductCount: 0,
    activeProductsWithValidPrice: 0,
    activePurchasableProductsWithValidPrice: 0,
    activeProductsMissingValidPrice: 0,
    activeProductsWithInventory: 0,
    activeProductsSellableOnBackorder: 0,
    activeProductsInventoryReady: 0,
    activeProductsWithoutSellableInventory: 0,
    activeComingSoonProductCount: 0,
    activePresaleProductCount: 0,
    activePresaleNotSellableProductCount: 0,
    activePhysicalProductsMissingWeight: 0,
    samples: {
      missingPrice: [],
      missingWeight: [],
      unsellableInventory: [],
      comingSoon: [],
      presaleNotSellable: [],
    },
    recentPaidOrderExists: false,
  }
}

function allReadyFacts(): SetupWizardFacts {
  return {
    ownerExists: true,
    storeNameConfigured: true,
    storeEmailConfigured: true,
    storeUrlReady: true,
    storeUrlIssue: null,
    stripeSource: 'db',
    stripeVerified: true,
    stripeHasSecretKey: true,
    stripeHasPublishableKey: true,
    stripeHasWebhookSecret: true,
    stripeWebhookDeliveryReceived: true,
    shippingCanUseManualRates: true,
    shippingCanUseLiveRates: false,
    emailProviderSource: 'db',
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
    samples: {
      missingPrice: [],
      missingWeight: [],
      unsellableInventory: [],
      comingSoon: [],
      presaleNotSellable: [],
    },
    recentPaidOrderExists: true,
  }
}

describe('buildSetupWizardSteps', () => {
  it('returns 9 steps regardless of facts', () => {
    const report = buildSetupWizardSteps(allMissingFacts())
    expect(report.steps).toHaveLength(9)
    expect(report.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('all required steps need setup when nothing is configured', () => {
    const report = buildSetupWizardSteps(allMissingFacts())

    expect(report.wizardComplete).toBe(false)
    expect(report.completedCount).toBe(0)

    const required = report.steps.filter((s) => s.isRequired)
    expect(required.every((s) => s.status === 'needs_setup')).toBe(true)

    const ownerStep = report.steps.find((s) => s.id === 'owner-account')
    expect(ownerStep?.status).toBe('needs_setup')
    expect(ownerStep?.ctaRoute).toBe('/create-owner')
  })

  it('all steps ready when everything is configured', () => {
    const report = buildSetupWizardSteps(allReadyFacts())

    expect(report.wizardComplete).toBe(true)
    expect(report.completedCount).toBe(report.steps.length)
    report.steps.forEach((step) => {
      expect(step.status).toBe('ready')
    })
  })

  it('marks Stripe as needs_setup when DB credentials are unverified', () => {
    const facts = allReadyFacts()
    facts.stripeVerified = false

    const report = buildSetupWizardSteps(facts)
    const stripe = report.steps.find((s) => s.id === 'stripe-connection')

    expect(stripe?.status).toBe('needs_setup')
    expect(stripe?.reason).toContain('have not been verified')
    expect(stripe?.ctaRoute).toBe('/settings?section=payments')
  })

  it('marks Stripe env fallback as needs_setup for private beta readiness', () => {
    const facts = allReadyFacts()
    facts.stripeSource = 'env'
    facts.stripeVerified = false

    const report = buildSetupWizardSteps(facts)
    const stripe = report.steps.find((s) => s.id === 'stripe-connection')

    expect(stripe?.status).toBe('needs_setup')
    expect(stripe?.reason).toContain('environment fallback')
    expect(stripe?.ctaRoute).toBe('/settings?section=payments')
  })

  it('keeps email optional when no provider is configured', () => {
    const facts = allReadyFacts()
    facts.emailProviderSource = 'none'

    const report = buildSetupWizardSteps(facts)
    const email = report.steps.find((s) => s.id === 'email-provider')

    expect(email?.status).toBe('optional')
    expect(email?.isRequired).toBe(false)
    expect(report.wizardComplete).toBe(true)
  })

  it('keeps email optional when env fallback is detected', () => {
    const facts = allReadyFacts()
    facts.emailProviderSource = 'env'

    const report = buildSetupWizardSteps(facts)
    const email = report.steps.find((s) => s.id === 'email-provider')

    expect(email?.status).toBe('optional')
    expect(email?.reason).toContain('environment fallback')
    expect(email?.ctaRoute).toBe('/settings?section=email')
  })

  it('marks webhook step as needs_setup when secret is missing', () => {
    const facts = allReadyFacts()
    facts.stripeHasWebhookSecret = false
    facts.stripeWebhookDeliveryReceived = false

    const report = buildSetupWizardSteps(facts)
    const webhook = report.steps.find((s) => s.id === 'stripe-webhook')

    expect(webhook?.status).toBe('needs_setup')
    expect(webhook?.reason).toContain('STRIPE_WEBHOOK_SECRET')
  })

  it('marks webhook step as needs_setup when store URL is placeholder', () => {
    const facts = allReadyFacts()
    facts.storeUrlReady = false
    facts.storeUrlIssue = 'placeholder'

    const report = buildSetupWizardSteps(facts)
    const webhook = report.steps.find((s) => s.id === 'stripe-webhook')

    expect(webhook?.status).toBe('needs_setup')
    expect(webhook?.reason).toContain('placeholder domain')
    expect(webhook?.ctaRoute).toBe('/settings?section=setup')
    expect(webhook?.ctaLabel).toBe('Fix store URL')
  })

  it('returns CTA routes for missing first-run required steps', () => {
    const report = buildSetupWizardSteps(allMissingFacts())
    const byId = new Map(report.steps.map((step) => [step.id, step]))

    expect(byId.get('store-profile')?.ctaRoute).toBe('/settings?section=general')
    expect(byId.get('stripe-connection')?.ctaRoute).toBe('/settings?section=payments')
    expect(byId.get('shipping')?.ctaRoute).toBe('/settings?section=shipping')
    expect(byId.get('product')?.ctaRoute).toBe('/products')
    expect(byId.get('test-checkout')?.status).toBe('needs_setup')
  })

  it('does not mark product step ready when only coming-soon products exist', () => {
    const facts = allReadyFacts()
    facts.activePurchasableProductCount = 0
    facts.activeProductsInventoryReady = 0
    facts.activeComingSoonProductCount = 2

    const report = buildSetupWizardSteps(facts)
    const product = report.steps.find((s) => s.id === 'product')

    expect(product?.status).toBe('needs_setup')
    expect(product?.reason).toContain('coming soon')
    expect(product?.ctaRoute).toBe('/products?readiness=coming_soon')
  })

  it('keeps product step ready when inventory is backorder-only', () => {
    const facts = allReadyFacts()
    facts.activeProductsWithInventory = 0
    facts.activeProductsSellableOnBackorder = 2
    facts.activeProductsInventoryReady = 2

    const report = buildSetupWizardSteps(facts)
    const product = report.steps.find((s) => s.id === 'product')

    expect(product?.status).toBe('ready')
    expect(product?.reason).toContain('backorder-enabled')
  })

  it('includes missing physical weight warning text without hard failing the product step', () => {
    const facts = allReadyFacts()
    facts.activePhysicalProductsMissingWeight = 1

    const report = buildSetupWizardSteps(facts)
    const product = report.steps.find((s) => s.id === 'product')

    expect(product?.status).toBe('ready')
    expect(product?.reason).toContain('missing valid variant weight')
  })

  it('has docs links for all steps', () => {
    const report = buildSetupWizardSteps(allMissingFacts())
    report.steps.forEach((step) => {
      expect(step.docsLink).toMatch(/^\/docs\//)
    })
  })

  it('links test-checkout and pilot-readiness docs to merchant launch guide', () => {
    const report = buildSetupWizardSteps(allMissingFacts())
    const byId = new Map(report.steps.map((step) => [step.id, step]))

    expect(byId.get('test-checkout')?.docsLink).toBe('/docs/operations/merchant-launch-guide')
    expect(byId.get('pilot-readiness')?.docsLink).toBe('/docs/operations/merchant-launch-guide')
  })
})

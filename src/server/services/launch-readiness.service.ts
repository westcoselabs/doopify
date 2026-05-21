export type LaunchReadinessStatus = 'ready' | 'needs_setup' | 'optional' | 'skipped'

export type LaunchReadinessCheck = {
  id: string
  title: string
  status: LaunchReadinessStatus
  summary: string
  fix?: string
  optional: boolean
}

export type LaunchReadinessReport = {
  checks: LaunchReadinessCheck[]
  readyCount: number
  needsSetupCount: number
  optionalCount: number
  skippedCount: number
  blockerCount: number
  launchReady: boolean
}

export type LaunchReadinessFacts = {
  storeConfigured: boolean | null
  storeContactConfigured: boolean | null

  stripeSource: 'db' | 'env' | 'none'
  stripeVerified: boolean
  stripeHasSecretKey: boolean
  stripeHasPublishableKey: boolean
  stripeHasWebhookSecret: boolean

  shippingMode: string | null
  shippingCanUseManualRates: boolean
  shippingCanUseLiveRates: boolean

  taxEnabled: boolean | null
  taxHasRate: boolean

  activeProductCount: number
  activeProductsWithValidPrice: number
  activeProductsWithInventory: number
  activeProductsSellableOnBackorder: number
  activeProductsInventoryReady: number
  activeProductsWithMedia: number

  storefrontUrlConfigured: boolean

  emailProviderSource: 'db' | 'env' | 'none'

  webhookRetrySecretPresent: boolean
}

export function buildLaunchReadinessReport(facts: LaunchReadinessFacts): LaunchReadinessReport {
  const checks: LaunchReadinessCheck[] = []

  // Store profile
  const storeProfileReady = facts.storeConfigured === true && facts.storeContactConfigured === true
  checks.push({
    id: 'store-profile',
    title: 'Store profile',
    optional: false,
    status: storeProfileReady ? 'ready' : 'needs_setup',
    summary: storeProfileReady
      ? 'Store name and contact email are configured.'
      : 'Store name or contact email is not set.',
    fix: storeProfileReady ? undefined : 'Set store name and contact email in Settings -> General.',
  })

  // Stripe runtime
  const stripeHasKeys = facts.stripeHasSecretKey && facts.stripeHasPublishableKey
  const stripeUsable = facts.stripeSource !== 'none' && stripeHasKeys
  let stripeStatus: LaunchReadinessStatus
  let stripeSummary: string
  let stripeFix: string | undefined

  if (!stripeUsable) {
    stripeStatus = 'needs_setup'
    stripeSummary = 'Stripe is not configured. Payments cannot be processed.'
    stripeFix = 'Add Stripe keys in Settings -> Payments.'
  } else if (facts.stripeSource === 'env') {
    stripeStatus = 'needs_setup'
    stripeSummary = 'Stripe is running from environment fallback credentials. Save and verify Stripe in Settings -> Payments.'
    stripeFix = 'Open Settings -> Payments and verify Stripe from the admin.'
  } else if (!facts.stripeVerified) {
    stripeStatus = 'needs_setup'
    stripeSummary = 'Stripe credentials are saved but have not been verified. Run verification in Settings -> Payments.'
    stripeFix = 'Open Settings -> Payments and run Stripe verification.'
  } else {
    stripeStatus = 'ready'
    stripeSummary = 'Stripe is runtime-verified and ready for checkout.'
  }

  checks.push({
    id: 'stripe-runtime',
    title: 'Stripe payments',
    optional: false,
    status: stripeStatus,
    summary: stripeSummary,
    fix: stripeFix,
  })

  // Shipping
  const shippingReady = facts.shippingCanUseManualRates || facts.shippingCanUseLiveRates
  checks.push({
    id: 'shipping',
    title: 'Shipping rates',
    optional: false,
    status: shippingReady ? 'ready' : 'needs_setup',
    summary: shippingReady
      ? facts.shippingCanUseLiveRates
        ? 'Live shipping rates are configured and the provider is connected.'
        : 'Manual shipping rates are configured.'
      : 'No shipping method is ready. Configure manual or live rates before launch.',
    fix: shippingReady ? undefined : 'Complete shipping setup in Settings -> Shipping & delivery.',
  })

  // Tax
  let taxStatus: LaunchReadinessStatus
  let taxSummary: string
  let taxFix: string | undefined

  if (facts.taxEnabled === false) {
    taxStatus = 'skipped'
    taxSummary = 'Tax collection is intentionally disabled.'
  } else if (facts.taxEnabled === true && facts.taxHasRate) {
    taxStatus = 'ready'
    taxSummary = 'Tax is enabled and a rate is configured.'
  } else if (facts.taxEnabled === true && !facts.taxHasRate) {
    taxStatus = 'needs_setup'
    taxSummary = 'Tax is enabled but no default rate is configured.'
    taxFix = 'Set a default tax rate in Settings -> Taxes & duties.'
  } else {
    taxStatus = 'needs_setup'
    taxSummary = 'Tax configuration is not set. Review tax settings before launch.'
    taxFix = 'Configure tax settings in Settings -> Taxes & duties.'
  }

  checks.push({
    id: 'tax',
    title: 'Tax',
    optional: false,
    status: taxStatus,
    summary: taxSummary,
    fix: taxFix,
  })

  // Active products
  checks.push({
    id: 'products-active',
    title: 'Active products',
    optional: false,
    status: facts.activeProductCount > 0 ? 'ready' : 'needs_setup',
    summary:
      facts.activeProductCount > 0
        ? `${facts.activeProductCount} active product(s) found.`
        : 'No active products found. At least one is required before launch.',
    fix: facts.activeProductCount > 0 ? undefined : 'Create and publish at least one product.',
  })

  // Product pricing
  const priceReady = facts.activeProductCount > 0 && facts.activeProductsWithValidPrice > 0
  checks.push({
    id: 'products-price',
    title: 'Product pricing',
    optional: false,
    status: facts.activeProductCount === 0 || !priceReady ? 'needs_setup' : 'ready',
    summary:
      facts.activeProductCount === 0
        ? 'No active products to check pricing for.'
        : priceReady
          ? `${facts.activeProductsWithValidPrice} active product(s) have a valid price.`
          : 'No active products have a non-zero price.',
    fix: priceReady ? undefined : 'Set a price greater than zero on at least one active product variant.',
  })

  // Product inventory
  const inventoryReady = facts.activeProductCount > 0 && facts.activeProductsInventoryReady > 0
  const hasBackorderOnlyCoverage = facts.activeProductsSellableOnBackorder > 0
  let inventorySummary: string

  if (facts.activeProductCount === 0) {
    inventorySummary = 'No active products to check inventory for.'
  } else if (facts.activeProductsWithInventory > 0 && hasBackorderOnlyCoverage) {
    inventorySummary = `${facts.activeProductsWithInventory} active product(s) have available inventory. ${facts.activeProductsSellableOnBackorder} active product(s) are sellable with zero inventory because continue-selling is enabled.`
  } else if (facts.activeProductsWithInventory > 0) {
    inventorySummary = `${facts.activeProductsWithInventory} active product(s) have available inventory.`
  } else if (hasBackorderOnlyCoverage) {
    inventorySummary = `Inventory is zero, but continue-selling is enabled for ${facts.activeProductsSellableOnBackorder} active product(s).`
  } else {
    inventorySummary = 'No active products have available inventory. All variants are at 0 and continue-selling is disabled.'
  }

  const inventoryFix =
    facts.activeProductCount > 0 && !inventoryReady
      ? 'Add inventory to at least one active product variant or enable continue-selling for at least one variant.'
      : hasBackorderOnlyCoverage
        ? 'Inventory is currently backorder-only. Restock at least one variant when possible.'
        : undefined

  checks.push({
    id: 'products-inventory',
    title: 'Product inventory',
    optional: false,
    status: facts.activeProductCount === 0 || !inventoryReady ? 'needs_setup' : 'ready',
    summary: inventorySummary,
    fix: inventoryFix,
  })

  // Product media (optional)
  checks.push({
    id: 'products-media',
    title: 'Product media',
    optional: true,
    status: facts.activeProductCount > 0 && facts.activeProductsWithMedia > 0 ? 'ready' : 'optional',
    summary:
      facts.activeProductCount === 0
        ? 'No active products.'
        : facts.activeProductsWithMedia === 0
          ? 'No active products have images. Media improves conversion but is not required for launch.'
          : `${facts.activeProductsWithMedia} of ${facts.activeProductCount} active product(s) have media.`,
  })

  // Storefront URL
  checks.push({
    id: 'storefront-settings',
    title: 'Storefront URL',
    optional: false,
    status: facts.storefrontUrlConfigured ? 'ready' : 'needs_setup',
    summary: facts.storefrontUrlConfigured
      ? 'NEXT_PUBLIC_STORE_URL is configured.'
      : 'NEXT_PUBLIC_STORE_URL is not set. Storefront links and email links will not work.',
    fix: facts.storefrontUrlConfigured
      ? undefined
      : 'Set NEXT_PUBLIC_STORE_URL in your runtime environment.',
  })

  // Email provider (optional)
  const emailReady = facts.emailProviderSource === 'db'
  checks.push({
    id: 'email-provider',
    title: 'Email provider',
    optional: true,
    status: emailReady ? 'ready' : 'optional',
    summary: emailReady
      ? 'Email provider is configured and verified in Settings -> Email.'
      : facts.emailProviderSource === 'env'
        ? 'Email is using environment fallback credentials. Configure and verify a provider in Settings -> Email.'
        : 'No email provider configured. Transactional emails are optional for private beta.',
    fix: emailReady
      ? undefined
      : 'Add Resend credentials in Settings -> Email to enable transactional emails.',
  })

  // Webhook/job observability (optional)
  checks.push({
    id: 'webhook-jobs',
    title: 'Webhook retry secret',
    optional: true,
    status: facts.webhookRetrySecretPresent ? 'ready' : 'optional',
    summary: facts.webhookRetrySecretPresent
      ? 'WEBHOOK_RETRY_SECRET is configured. Retry routes are protected.'
      : 'WEBHOOK_RETRY_SECRET is not set. Retry routes are unprotected. Set before public launch.',
    fix: facts.webhookRetrySecretPresent
      ? undefined
      : 'Set WEBHOOK_RETRY_SECRET to protect webhook retry routes.',
  })

  const readyCount = checks.filter((c) => c.status === 'ready').length
  const needsSetupCount = checks.filter((c) => c.status === 'needs_setup').length
  const optionalCount = checks.filter((c) => c.status === 'optional').length
  const skippedCount = checks.filter((c) => c.status === 'skipped').length
  const blockerCount = checks.filter((c) => !c.optional && c.status === 'needs_setup').length

  return {
    checks,
    readyCount,
    needsSetupCount,
    optionalCount,
    skippedCount,
    blockerCount,
    launchReady: blockerCount === 0,
  }
}

import type { PublicStoreUrlIssue } from "@/lib/public-store-url";

export type LaunchReadinessStatus =
  "ready" | "needs_setup" | "warning" | "optional" | "skipped";

export type LaunchReadinessSeverity = "blocker" | "warning" | "info";
export type LaunchReadinessCategory =
  | "store"
  | "payments"
  | "shipping"
  | "products"
  | "email"
  | "operations"
  | "test_order";

export type LaunchReadinessCheck = {
  id: string;
  title: string;
  category: LaunchReadinessCategory;
  status: LaunchReadinessStatus;
  severity: LaunchReadinessSeverity;
  summary: string;
  fix?: string;
  ctaLabel?: string;
  ctaRoute?: string;
  optional: boolean;
  metadata?: Record<string, unknown>;
};

export type LaunchReadinessSummary = {
  launchReady: boolean;
  total: number;
  ready: number;
  blockers: number;
  warnings: number;
  optional: number;
  checkedAt: string;
};

export type LaunchReadinessSignals = {
  emailJobHealthLevel?: "healthy" | "warning" | "critical" | "unknown";
  runnerHealth?: "healthy" | "warning" | "critical" | "unknown";
  checkedAt: string;
};

export type LaunchReadinessReport = {
  checks: LaunchReadinessCheck[];
  summary: LaunchReadinessSummary;
  signals?: LaunchReadinessSignals;
  // Legacy counters preserved for existing consumers.
  readyCount: number;
  needsSetupCount: number;
  optionalCount: number;
  skippedCount: number;
  warningCount: number;
  blockerCount: number;
  launchReady: boolean;
};

export type LaunchReadinessFacts = {
  storeConfigured: boolean | null;
  storeContactConfigured: boolean | null;

  stripeConfigured: boolean;
  stripeHasWebhookSecret: boolean;
  stripeWebhookDeliveryReceived: boolean;

  shippingStatusUnavailable?: boolean;
  shippingRequired?: boolean;
  shippingMode: string | null;
  shippingCanUseManualRates: boolean;
  shippingCanUseLiveRates: boolean;

  taxEnabled: boolean | null;
  taxHasRate: boolean;

  activeProductCount: number;
  activePurchasableProductCount: number;
  activeProductsWithValidPrice: number;
  activePurchasableProductsWithValidPrice: number;
  activeProductsMissingValidPrice: number;
  activeProductsWithInventory: number;
  activeProductsSellableOnBackorder: number;
  activeProductsInventoryReady: number;
  activeProductsWithoutSellableInventory: number;
  activeComingSoonProductCount: number;
  activePresaleProductCount: number;
  activePresaleNotSellableProductCount: number;
  activePhysicalProductsMissingWeight: number;
  activeProductsWithMedia: number;
  samples: {
    missingPrice: Array<{ id: string; title: string }>;
    missingWeight: Array<{ id: string; title: string }>;
    unsellableInventory: Array<{ id: string; title: string }>;
    comingSoon: Array<{ id: string; title: string }>;
    presaleNotSellable: Array<{ id: string; title: string }>;
  };

  storefrontUrlConfigured: boolean;
  storefrontUrlIssue: PublicStoreUrlIssue | null;
  storefrontUrlMessage: string;

  emailConfigured: boolean;

  webhookRetrySecretPresent: boolean;
  recentPaidOrderExists: boolean;
};

function baseCheck(input: LaunchReadinessCheck): LaunchReadinessCheck {
  return input;
}

export function buildLaunchReadinessReport(
  facts: LaunchReadinessFacts,
  input?: {
    checkedAt?: string;
    signals?: LaunchReadinessSignals;
  },
): LaunchReadinessReport {
  const checkedAt = input?.checkedAt ?? new Date().toISOString();
  const checks: LaunchReadinessCheck[] = [];

  const storeProfileReady =
    facts.storeConfigured === true && facts.storeContactConfigured === true;
  checks.push(
    baseCheck({
      id: "store-profile",
      title: "Store profile",
      category: "store",
      optional: false,
      severity: storeProfileReady ? "info" : "blocker",
      status: storeProfileReady ? "ready" : "needs_setup",
      summary: storeProfileReady
        ? "Store name and contact email are configured."
        : "Store name or contact email is not set.",
      fix: storeProfileReady
        ? undefined
        : "Set store name and contact email in Settings -> General.",
      ctaLabel: storeProfileReady ? undefined : "Edit store profile",
      ctaRoute: storeProfileReady ? undefined : "/admin/settings/general",
    }),
  );

  checks.push(
    baseCheck({
      id: "stripe-runtime",
      title: "Stripe payments",
      category: "payments",
      optional: false,
      severity: facts.stripeConfigured ? "info" : "blocker",
      status: facts.stripeConfigured ? "ready" : "needs_setup",
      summary: facts.stripeConfigured
        ? "Stripe environment configuration is present."
        : "Stripe environment configuration is incomplete.",
      fix: facts.stripeConfigured
        ? undefined
        : "Configure Stripe environment variables and redeploy.",
      ctaLabel: facts.stripeConfigured ? undefined : "View environment",
      ctaRoute: facts.stripeConfigured ? undefined : "/admin/system/developer",
    }),
  );

  const storeUrlReady = facts.storefrontUrlConfigured;
  if (!storeUrlReady) {
    checks.push(
      baseCheck({
        id: "stripe-webhook-confidence",
        title: "Stripe webhook confidence",
        category: "payments",
        optional: false,
        severity: "blocker",
        status: "needs_setup",
        summary:
          facts.storefrontUrlIssue === "placeholder"
            ? "Store URL is still using a placeholder domain. Stripe webhook endpoint confidence cannot be established."
            : facts.storefrontUrlIssue === "localhost_production"
              ? "Store URL is localhost in production. Stripe webhook endpoint confidence cannot be established."
              : "Store URL is not ready. Stripe webhook endpoint confidence cannot be established.",
        fix: facts.storefrontUrlMessage,
        ctaLabel: "Fix store URL",
        ctaRoute: "/admin/system/developer",
      }),
    );
  } else if (!facts.stripeHasWebhookSecret) {
    checks.push(
      baseCheck({
        id: "stripe-webhook-confidence",
        title: "Stripe webhook confidence",
        category: "payments",
        optional: false,
        severity: "blocker",
        status: "needs_setup",
        summary:
          "STRIPE_WEBHOOK_SECRET is missing. Paid orders are finalized by verified Stripe webhooks.",
        fix: "Configure STRIPE_WEBHOOK_SECRET in the environment and register the Stripe webhook endpoint.",
        ctaLabel: "Configure payments",
        ctaRoute: "/admin/system/developer",
      }),
    );
  } else if (!facts.stripeWebhookDeliveryReceived) {
    checks.push(
      baseCheck({
        id: "stripe-webhook-confidence",
        title: "Stripe webhook confidence",
        category: "payments",
        optional: true,
        severity: "warning",
        status: "warning",
        summary:
          "Webhook secret is configured, but no processed payment_intent.succeeded delivery is recorded yet.",
        fix: "Run a test checkout and confirm delivery in Delivery logs.",
        ctaLabel: "View delivery logs",
        ctaRoute: "/admin/webhooks",
      }),
    );
  } else {
    checks.push(
      baseCheck({
        id: "stripe-webhook-confidence",
        title: "Stripe webhook confidence",
        category: "payments",
        optional: false,
        severity: "info",
        status: "ready",
        summary:
          "Stripe webhook secret is configured and a processed payment_intent.succeeded delivery has been recorded.",
        ctaLabel: "View delivery logs",
        ctaRoute: "/admin/webhooks",
      }),
    );
  }

  const shippingStatusUnavailable = facts.shippingStatusUnavailable === true;
  const shippingRequired = facts.shippingRequired !== false;
  const shippingReady =
    facts.shippingCanUseManualRates || facts.shippingCanUseLiveRates;

  let shippingStatus: LaunchReadinessStatus;
  let shippingSeverity: LaunchReadinessSeverity;
  let shippingSummary: string;
  let shippingFix: string | undefined;
  let shippingCtaLabel: string | undefined;

  if (!shippingRequired) {
    shippingStatus = "optional";
    shippingSeverity = "info";
    shippingSummary =
      "No active physical products currently require shipping rates.";
  } else if (shippingStatusUnavailable) {
    shippingStatus = "warning";
    shippingSeverity = "warning";
    shippingSummary = "Shipping readiness could not be checked.";
    shippingFix = "Review shipping configuration and rerun the launch check.";
    shippingCtaLabel = "Open shipping";
  } else if (!shippingReady) {
    shippingStatus = "needs_setup";
    shippingSeverity = "blocker";
    shippingSummary =
      "No shipping method is ready. Configure manual or live rates before launch.";
    shippingFix = "Complete shipping setup in Settings -> Shipping & delivery.";
    shippingCtaLabel = "Configure shipping";
  } else {
    shippingStatus = "ready";
    shippingSeverity = "info";
    shippingSummary = facts.shippingCanUseLiveRates
      ? "Live shipping configuration is ready; test a checkout rate before launch."
      : "Manual shipping rates are configured.";
  }

  checks.push(
    baseCheck({
      id: "shipping",
      title: "Shipping rates",
      category: "shipping",
      optional: shippingStatus !== "needs_setup",
      severity: shippingSeverity,
      status: shippingStatus,
      summary: shippingSummary,
      fix: shippingFix,
      ctaLabel: shippingCtaLabel,
      ctaRoute: shippingCtaLabel ? "/admin/settings/shipping" : undefined,
      metadata: {
        shippingMode: facts.shippingMode,
      },
    }),
  );

  let taxStatus: LaunchReadinessStatus;
  let taxSummary: string;
  let taxFix: string | undefined;

  if (facts.taxEnabled === false) {
    taxStatus = "skipped";
    taxSummary = "Tax collection is intentionally disabled.";
  } else if (facts.taxEnabled === true && facts.taxHasRate) {
    taxStatus = "ready";
    taxSummary = "Tax is enabled and a rate is configured.";
  } else if (facts.taxEnabled === true && !facts.taxHasRate) {
    taxStatus = "needs_setup";
    taxSummary = "Tax is enabled but no default rate is configured.";
    taxFix = "Set a default tax rate in Settings -> Taxes & duties.";
  } else {
    taxStatus = "needs_setup";
    taxSummary =
      "Tax configuration is not set. Review tax settings before launch.";
    taxFix = "Configure tax settings in Settings -> Taxes & duties.";
  }

  checks.push(
    baseCheck({
      id: "tax",
      title: "Tax",
      category: "operations",
      optional: false,
      severity: taxStatus === "needs_setup" ? "blocker" : "info",
      status: taxStatus,
      summary: taxSummary,
      fix: taxFix,
      ctaLabel: taxStatus === "needs_setup" ? "Configure taxes" : undefined,
      ctaRoute:
        taxStatus === "needs_setup" ? "/admin/settings/taxes" : undefined,
    }),
  );

  checks.push(
    baseCheck({
      id: "products-active",
      title: "Active products",
      category: "products",
      optional: false,
      severity: facts.activeProductCount > 0 ? "info" : "blocker",
      status: facts.activeProductCount > 0 ? "ready" : "needs_setup",
      summary:
        facts.activeProductCount > 0
          ? `${facts.activeProductCount} active product(s) found. ${facts.activePurchasableProductCount} currently purchasable.`
          : "No active products found. At least one is required before launch.",
      fix:
        facts.activeProductCount > 0
          ? undefined
          : "Create and publish at least one product.",
      ctaLabel: facts.activeProductCount > 0 ? undefined : "Open products",
      ctaRoute: facts.activeProductCount > 0 ? undefined : "/products",
      metadata: {
        activeProductCount: facts.activeProductCount,
        activePurchasableProductCount: facts.activePurchasableProductCount,
        activeComingSoonProductCount: facts.activeComingSoonProductCount,
        activePresaleProductCount: facts.activePresaleProductCount,
      },
    }),
  );

  const priceReady =
    facts.activePurchasableProductCount > 0 &&
    facts.activePurchasableProductsWithValidPrice > 0;
  checks.push(
    baseCheck({
      id: "products-price",
      title: "Product pricing",
      category: "products",
      optional: false,
      severity: priceReady ? "info" : "blocker",
      status:
        facts.activeProductCount === 0 ||
        facts.activePurchasableProductCount === 0 ||
        !priceReady
          ? "needs_setup"
          : "ready",
      summary:
        facts.activeProductCount === 0
          ? "No active products to check pricing for."
          : facts.activePurchasableProductCount === 0
            ? "Active products exist, but none are currently purchasable. Configure coming-soon/presale availability first."
            : priceReady
              ? `${facts.activePurchasableProductsWithValidPrice} purchasable product(s) have a valid price.`
              : "Purchasable products exist, but none have a non-zero variant price.",
      fix: priceReady
        ? undefined
        : "Set a price greater than zero on at least one purchasable product variant.",
      ctaLabel: priceReady ? undefined : "Open products",
      ctaRoute: priceReady ? undefined : "/products?readiness=needs_price",
      metadata: {
        affectedCount: facts.activeProductsMissingValidPrice,
        activeProductsWithValidPrice: facts.activeProductsWithValidPrice,
        activePurchasableProductsWithValidPrice:
          facts.activePurchasableProductsWithValidPrice,
        samples: facts.samples.missingPrice,
      },
    }),
  );

  const inventoryReady =
    facts.activePurchasableProductCount > 0 &&
    facts.activeProductsInventoryReady > 0;
  const hasBackorderOnlyCoverage =
    facts.activeProductsWithInventory === 0 &&
    facts.activeProductsSellableOnBackorder > 0;
  let inventoryStatus: LaunchReadinessStatus = "ready";
  let inventorySeverity: LaunchReadinessSeverity = "info";
  let inventorySummary: string;
  let inventoryFix: string | undefined;

  if (facts.activeProductCount === 0) {
    inventoryStatus = "needs_setup";
    inventorySeverity = "blocker";
    inventorySummary = "No active products to check inventory for.";
    inventoryFix =
      "Create and publish at least one product with sellable variants.";
  } else if (facts.activePurchasableProductCount === 0) {
    inventoryStatus = "needs_setup";
    inventorySeverity = "blocker";
    inventorySummary =
      facts.activeComingSoonProductCount > 0
        ? `Active products are visible, but ${facts.activeComingSoonProductCount} are coming soon and not purchasable yet.`
        : facts.activePresaleNotSellableProductCount > 0
          ? `${facts.activePresaleNotSellableProductCount} presale product(s) are not currently purchasable.`
          : "Active products are not currently purchasable due to availability settings.";
    inventoryFix =
      "Adjust product selling mode/availability in Products so at least one product is purchasable now.";
  } else if (!inventoryReady) {
    inventoryStatus = "needs_setup";
    inventorySeverity = "blocker";
    inventorySummary =
      "Purchasable products have no sellable inventory. Variants are at 0 and continue-selling is disabled.";
    inventoryFix =
      "Add inventory to at least one purchasable variant or enable continue-selling for at least one variant.";
  } else if (hasBackorderOnlyCoverage) {
    inventoryStatus = "warning";
    inventorySeverity = "warning";
    inventorySummary = `Inventory is zero, but continue-selling is enabled for ${facts.activeProductsSellableOnBackorder} purchasable product(s).`;
    inventoryFix =
      "Inventory is backorder-only. Restock at least one variant when possible.";
  } else if (
    facts.activeProductsWithInventory > 0 &&
    facts.activeProductsSellableOnBackorder > 0
  ) {
    inventorySummary = `${facts.activeProductsWithInventory} purchasable product(s) have available inventory. ${facts.activeProductsSellableOnBackorder} purchasable product(s) are sellable with zero inventory because continue-selling is enabled.`;
  } else {
    inventorySummary = `${facts.activeProductsWithInventory} purchasable product(s) have available inventory.`;
  }

  const inventoryCtaRoute =
    inventoryStatus === "ready"
      ? undefined
      : facts.activePurchasableProductCount === 0 &&
          facts.activeComingSoonProductCount > 0
        ? "/products?readiness=coming_soon"
        : "/products?readiness=needs_inventory";

  checks.push(
    baseCheck({
      id: "products-inventory",
      title: "Product inventory",
      category: "products",
      optional: inventoryStatus === "warning",
      severity: inventorySeverity,
      status: inventoryStatus,
      summary: inventorySummary,
      fix: inventoryFix,
      ctaLabel: inventoryStatus === "ready" ? undefined : "Open products",
      ctaRoute: inventoryCtaRoute,
      metadata: {
        affectedCount: facts.activeProductsWithoutSellableInventory,
        activeProductsWithInventory: facts.activeProductsWithInventory,
        activeProductsSellableOnBackorder:
          facts.activeProductsSellableOnBackorder,
        activeProductsInventoryReady: facts.activeProductsInventoryReady,
        activeComingSoonProductCount: facts.activeComingSoonProductCount,
        activePresaleNotSellableProductCount:
          facts.activePresaleNotSellableProductCount,
        samples: facts.samples.unsellableInventory,
      },
    }),
  );

  const missingWeightCount = facts.activePhysicalProductsMissingWeight;
  checks.push(
    baseCheck({
      id: "products-weight",
      title: "Physical product weight",
      category: "products",
      optional: true,
      severity: missingWeightCount > 0 ? "warning" : "info",
      status: missingWeightCount > 0 ? "warning" : "ready",
      summary:
        missingWeightCount > 0
          ? `${missingWeightCount} active physical product(s) are missing valid variant weight.`
          : "Physical products have valid variant weight configured.",
      fix:
        missingWeightCount > 0
          ? "Set a weight greater than 0 on each active physical product variant."
          : undefined,
      ctaLabel: missingWeightCount > 0 ? "Open products" : undefined,
      ctaRoute:
        missingWeightCount > 0 ? "/products?readiness=needs_weight" : undefined,
      metadata: {
        affectedCount: missingWeightCount,
        samples: facts.samples.missingWeight,
      },
    }),
  );

  checks.push(
    baseCheck({
      id: "products-media",
      title: "Product media",
      category: "products",
      optional: true,
      severity: "info",
      status:
        facts.activeProductCount > 0 && facts.activeProductsWithMedia > 0
          ? "ready"
          : "optional",
      summary:
        facts.activeProductCount === 0
          ? "No active products."
          : facts.activeProductsWithMedia === 0
            ? "No active products have images. Media improves conversion but is optional."
            : `${facts.activeProductsWithMedia} of ${facts.activeProductCount} active product(s) have media.`,
      ctaLabel: facts.activeProductsWithMedia > 0 ? undefined : "Open products",
      ctaRoute:
        facts.activeProductsWithMedia > 0
          ? undefined
          : "/products?readiness=needs_media",
      metadata: {
        activeProductsWithMedia: facts.activeProductsWithMedia,
      },
    }),
  );

  checks.push(
    baseCheck({
      id: "storefront-settings",
      title: "Storefront URL",
      category: "store",
      optional: false,
      severity: facts.storefrontUrlConfigured ? "info" : "blocker",
      status: facts.storefrontUrlConfigured ? "ready" : "needs_setup",
      summary: facts.storefrontUrlMessage,
      fix: facts.storefrontUrlConfigured
        ? undefined
        : "Set NEXT_PUBLIC_STORE_URL to the deployed public storefront URL and redeploy.",
      ctaLabel: facts.storefrontUrlConfigured ? undefined : "Open setup checks",
      ctaRoute: facts.storefrontUrlConfigured
        ? undefined
        : "/admin/system/developer",
      metadata: facts.storefrontUrlIssue
        ? { issue: facts.storefrontUrlIssue }
        : undefined,
    }),
  );

  const emailReady = facts.emailConfigured;
  checks.push(
    baseCheck({
      id: "email-provider",
      title: "Email provider",
      category: "email",
      optional: true,
      severity: "info",
      status: emailReady ? "ready" : "optional",
      summary: emailReady
        ? "The selected email provider is configured in the environment."
        : "No email delivery provider is configured.",
      fix: emailReady
        ? undefined
        : "Configure EMAIL_PROVIDER and its environment variables to enable transactional email.",
      ctaLabel: emailReady ? undefined : "View environment",
      ctaRoute: emailReady ? undefined : "/admin/system/developer",
    }),
  );

  const emailJobHealthLevel = input?.signals?.emailJobHealthLevel || "unknown";
  if (emailReady && emailJobHealthLevel === "unknown") {
    checks.push(
      baseCheck({
        id: "email-job-health",
        title: "Email job health",
        category: "operations",
        optional: true,
        severity: "warning",
        status: "warning",
        summary:
          "Email sender is configured, but job health is currently unknown.",
        fix: "Open Delivery logs to check runner heartbeat and recent email delivery outcomes.",
        ctaLabel: "View delivery logs",
        ctaRoute: "/admin/webhooks",
      }),
    );
  }

  checks.push(
    baseCheck({
      id: "webhook-jobs",
      title: "Webhook retry secret",
      category: "operations",
      optional: true,
      severity: facts.webhookRetrySecretPresent ? "info" : "warning",
      status: facts.webhookRetrySecretPresent ? "ready" : "warning",
      summary: facts.webhookRetrySecretPresent
        ? "WEBHOOK_RETRY_SECRET is configured. Retry routes are protected."
        : "WEBHOOK_RETRY_SECRET is not set. Set it before public launch to protect retry routes.",
      fix: facts.webhookRetrySecretPresent
        ? undefined
        : "Set WEBHOOK_RETRY_SECRET to a high-entropy value.",
      ctaLabel: facts.webhookRetrySecretPresent
        ? undefined
        : "Open setup checks",
      ctaRoute: facts.webhookRetrySecretPresent
        ? undefined
        : "/admin/system/developer",
    }),
  );

  checks.push(
    baseCheck({
      id: "test-order",
      title: "Test order",
      category: "test_order",
      optional: true,
      severity: facts.recentPaidOrderExists ? "info" : "warning",
      status: facts.recentPaidOrderExists ? "ready" : "warning",
      summary: facts.recentPaidOrderExists
        ? "A recent paid order exists. Checkout and webhook order finalization have been exercised."
        : "No recent paid order is recorded yet. Run a test checkout before launch.",
      fix: facts.recentPaidOrderExists
        ? undefined
        : "Run a paid test checkout (for example Stripe test card 4242 4242 4242 4242) and confirm order creation.",
      ctaLabel: facts.recentPaidOrderExists
        ? "View orders"
        : "Run test checkout",
      ctaRoute: facts.recentPaidOrderExists ? "/orders" : "/shop",
    }),
  );

  const readyCount = checks.filter((check) => check.status === "ready").length;
  const needsSetupCount = checks.filter(
    (check) => check.status === "needs_setup",
  ).length;
  const warningCount = checks.filter(
    (check) => check.status === "warning",
  ).length;
  const optionalCount = checks.filter(
    (check) => check.status === "optional" || check.status === "warning",
  ).length;
  const skippedCount = checks.filter(
    (check) => check.status === "skipped",
  ).length;
  const blockerCount = checks.filter(
    (check) => check.severity === "blocker" && check.status === "needs_setup",
  ).length;

  const summary: LaunchReadinessSummary = {
    launchReady: blockerCount === 0,
    total: checks.length,
    ready: readyCount,
    blockers: blockerCount,
    warnings: warningCount,
    optional: checks.filter((check) => check.optional).length,
    checkedAt,
  };

  return {
    checks,
    summary,
    signals: input?.signals,
    readyCount,
    needsSetupCount,
    optionalCount,
    skippedCount,
    warningCount,
    blockerCount,
    launchReady: summary.launchReady,
  };
}

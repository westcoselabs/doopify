import { env } from "@/lib/env";
import { evaluatePublicStoreUrl } from "@/lib/public-store-url";
import { prisma } from "@/lib/prisma";
import { getIntegrationStatuses } from "@/server/config/integration-status";
import { findPrimaryStore } from "./primary-store.service";
import { getEmailJobHealthSnapshot } from "@/server/jobs/email-job-health.service";
import {
  buildLaunchReadinessReport,
  type LaunchReadinessReport,
} from "./launch-readiness.service";
import { evaluateProductLaunchReadiness } from "./product-launch-readiness.service";
import {
  buildShippingSetupStatus,
  getShippingSetupStore,
} from "@/server/shipping/shipping-setup.service";

export type LaunchReadinessRunResult = LaunchReadinessReport & {
  checkedAt: string;
};

// Explicit launch checks scan bounded pages; ordinary page loads read only a saved snapshot.
async function gatherProductFacts() {
  const totals = evaluateProductLaunchReadiness([]);
  let activePhysicalProductCount = 0;
  let cursor: string | undefined;
  const now = new Date();
  for (;;) {
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        salesMode: true,
        presaleStartsAt: true,
        presaleEndsAt: true,
        availableForPurchaseAt: true,
        fulfillmentType: true,
        media: { where: { isFeatured: true }, select: { id: true }, take: 1 },
        variants: {
          select: {
            priceCents: true,
            inventory: true,
            continueSellingWhenOutOfStock: true,
            weight: true,
          },
        },
      },
    });
    const page = evaluateProductLaunchReadiness(products, now);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      if (key === "samples") continue;
      totals[key] += page[key];
    }
    for (const key of Object.keys(totals.samples) as Array<
      keyof typeof totals.samples
    >) {
      totals.samples[key] = [
        ...totals.samples[key],
        ...page.samples[key],
      ].slice(0, 3);
    }
    activePhysicalProductCount += products.filter(
      (product) => product.fulfillmentType === "PHYSICAL",
    ).length;
    if (products.length < 250) break;
    cursor = products[products.length - 1].id;
  }
  return { ...totals, activePhysicalProductCount };
}

export async function runLaunchReadinessCheck(): Promise<LaunchReadinessRunResult> {
  const checkedAt = new Date().toISOString();
  const integrations = getIntegrationStatuses();
  const stripe = integrations.find((status) => status.id === "stripe")!;
  const email = integrations.find((status) => status.id === env.EMAIL_PROVIDER);
  const [store, productFacts, webhook, paidOrder, shipping, health, taxRule] =
    await Promise.all([
      findPrimaryStore({
        select: {
          name: true,
          email: true,
          taxEnabled: true,
          defaultTaxRateBps: true,
        },
      }),
      gatherProductFacts(),
      prisma.webhookDelivery.findFirst({
        where: {
          provider: "stripe",
          eventType: "payment_intent.succeeded",
          status: "PROCESSED",
        },
        select: { id: true },
      }),
      prisma.order.findFirst({
        where: {
          paymentStatus: "PAID",
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      }),
      getShippingSetupStore()
        .then((store) => (store ? buildShippingSetupStatus(store) : null))
        .catch(() => null),
      getEmailJobHealthSnapshot().catch(() => null),
      prisma.taxRule.findFirst({
        where: { isActive: true },
        select: { id: true },
      }),
    ]);
  const publicUrl = evaluatePublicStoreUrl({
    value: env.NEXT_PUBLIC_STORE_URL,
    nodeEnv: env.NODE_ENV,
  });
  const report = buildLaunchReadinessReport(
    {
      storeConfigured: store ? Boolean(store.name.trim()) : null,
      storeContactConfigured: store ? Boolean(store.email?.trim()) : null,
      stripeConfigured: stripe.configured,
      stripeHasWebhookSecret: Boolean(stripe.webhookReady),
      stripeWebhookDeliveryReceived: Boolean(webhook),
      shippingStatusUnavailable: !shipping,
      shippingRequired: productFacts.activePhysicalProductCount > 0,
      shippingMode: shipping?.mode ?? null,
      shippingCanUseManualRates: shipping?.canUseManualRates ?? false,
      shippingCanUseLiveRates: shipping?.canUseLiveRates ?? false,
      taxEnabled: store?.taxEnabled ?? null,
      taxHasRate: (store?.defaultTaxRateBps ?? 0) > 0 || Boolean(taxRule),
      ...productFacts,
      storefrontUrlConfigured: publicUrl.ready,
      storefrontUrlIssue: publicUrl.issue,
      storefrontUrlMessage: publicUrl.message,
      emailConfigured: Boolean(email?.configured),
      webhookRetrySecretPresent: Boolean(env.WEBHOOK_RETRY_SECRET),
      recentPaidOrderExists: Boolean(paidOrder),
    },
    {
      checkedAt,
      signals: {
        emailJobHealthLevel: health?.level ?? "unknown",
        runnerHealth:
          health?.runner.health === "healthy"
            ? "healthy"
            : health?.runner.health === "failing"
              ? "critical"
              : health
                ? "warning"
                : "unknown",
        checkedAt,
      },
    },
  );
  return { ...report, checkedAt };
}

import { err, ok } from '@/lib/api'
import { evaluatePublicStoreUrl } from '@/lib/public-store-url'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/server/auth/require-auth'
import { getStripeProviderStatus } from '@/server/payments/stripe-runtime.service'
import { evaluateProductLaunchReadiness } from '@/server/services/product-launch-readiness.service'
import { getRuntimeProviderConnection } from '@/server/services/provider-connection.service'
import {
  buildSetupWizardSteps,
  type SetupWizardFacts,
} from '@/server/services/setup-wizard.service'
import {
  buildShippingSetupStatus,
  getShippingSetupStore,
} from '@/server/shipping/shipping-setup.service'

export const runtime = 'nodejs'

async function gatherProductFacts() {
  const activeProducts = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
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
  })

  return evaluateProductLaunchReadiness(activeProducts)
}

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      ownerCount,
      store,
      stripeProviderStatus,
      emailRuntime,
      shippingStore,
      productFacts,
      stripeWebhookCount,
      recentPaidOrderCount,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'OWNER', isActive: true } }),
      prisma.store.findFirst({
        select: { name: true, email: true },
        orderBy: { createdAt: 'asc' },
      }),
      getStripeProviderStatus(),
      getRuntimeProviderConnection('RESEND'),
      getShippingSetupStore(),
      gatherProductFacts(),
      // Count processed Stripe payment_intent.succeeded deliveries
      prisma.webhookDelivery.count({
        where: {
          provider: 'stripe',
          eventType: 'payment_intent.succeeded',
          status: 'PROCESSED',
        },
      }),
      // Count paid orders created within the past 30 days
      prisma.order.count({
        where: {
          paymentStatus: 'PAID',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ])

    const shippingStatus = shippingStore ? await buildShippingSetupStatus(shippingStore) : null
    const publicStoreUrl = evaluatePublicStoreUrl({
      value: process.env.NEXT_PUBLIC_STORE_URL,
      nodeEnv: process.env.NODE_ENV,
    })

    const facts: SetupWizardFacts = {
      ownerExists: ownerCount > 0,
      storeNameConfigured: Boolean(store?.name?.trim()),
      storeEmailConfigured: Boolean(store?.email?.trim()),
      storeUrlReady: publicStoreUrl.ready,
      storeUrlIssue: publicStoreUrl.issue,

      stripeSource: stripeProviderStatus.source,
      stripeVerified: stripeProviderStatus.verified,
      stripeHasSecretKey: stripeProviderStatus.hasSecretKey,
      stripeHasPublishableKey: stripeProviderStatus.hasPublishableKey,
      stripeHasWebhookSecret: stripeProviderStatus.webhookConfigured,
      stripeWebhookDeliveryReceived: stripeWebhookCount > 0,

      shippingCanUseManualRates: shippingStatus?.canUseManualRates ?? false,
      shippingCanUseLiveRates: shippingStatus?.canUseLiveRates ?? false,

      emailProviderSource: emailRuntime.source,

      ...productFacts,

      recentPaidOrderExists: recentPaidOrderCount > 0,
    }

    const report = buildSetupWizardSteps(facts)

    return ok({
      ...report,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[GET /api/setup/wizard]', error)
    return err('Failed to gather setup wizard status', 500)
  }
}

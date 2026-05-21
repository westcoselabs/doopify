import { err, ok } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/server/auth/require-auth'
import { getStripeRuntimeConnection } from '@/server/payments/stripe-runtime.service'
import { getVariantInventoryReadiness } from '@/server/services/product-availability.service'
import { getRuntimeProviderConnection } from '@/server/services/provider-connection.service'
import {
  buildLaunchReadinessReport,
  type LaunchReadinessFacts,
} from '@/server/services/launch-readiness.service'
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
      media: { where: { isFeatured: true }, select: { id: true }, take: 1 },
      variants: { select: { priceCents: true, inventory: true, continueSellingWhenOutOfStock: true } },
    },
  })

  let activeProductsWithValidPrice = 0
  let activeProductsWithInventory = 0
  let activeProductsSellableOnBackorder = 0
  let activeProductsInventoryReady = 0
  let activeProductsWithMedia = 0

  for (const product of activeProducts) {
    const readiness = getVariantInventoryReadiness(product.variants)

    if (product.variants.some((v) => v.priceCents > 0)) activeProductsWithValidPrice++
    if (readiness.hasPositiveInventory) activeProductsWithInventory++
    if (readiness.backorderOnly) activeProductsSellableOnBackorder++
    if (readiness.inventoryReady) activeProductsInventoryReady++
    if (product.media.length > 0) activeProductsWithMedia++
  }

  return {
    activeProductCount: activeProducts.length,
    activeProductsWithValidPrice,
    activeProductsWithInventory,
    activeProductsSellableOnBackorder,
    activeProductsInventoryReady,
    activeProductsWithMedia,
  }
}

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const [store, stripe, emailRuntime, shippingStore, productFacts] = await Promise.all([
      prisma.store.findFirst({
        select: {
          name: true,
          email: true,
          taxEnabled: true,
          defaultTaxRateBps: true,
        },
      }),
      getStripeRuntimeConnection(),
      getRuntimeProviderConnection('RESEND'),
      getShippingSetupStore(),
      gatherProductFacts(),
    ])

    const shippingStatus = shippingStore ? await buildShippingSetupStatus(shippingStore) : null

    const facts: LaunchReadinessFacts = {
      storeConfigured: store ? Boolean(store.name?.trim()) : null,
      storeContactConfigured: store ? Boolean(store.email?.trim()) : null,

      stripeSource: stripe.source,
      stripeVerified: stripe.verified,
      stripeHasSecretKey: Boolean(stripe.secretKey),
      stripeHasPublishableKey: Boolean(stripe.publishableKey),
      stripeHasWebhookSecret: Boolean(stripe.webhookSecret),

      shippingMode: shippingStatus?.mode ?? null,
      shippingCanUseManualRates: shippingStatus?.canUseManualRates ?? false,
      shippingCanUseLiveRates: shippingStatus?.canUseLiveRates ?? false,

      taxEnabled: store?.taxEnabled ?? null,
      taxHasRate: (store?.defaultTaxRateBps ?? 0) > 0,

      ...productFacts,

      storefrontUrlConfigured: Boolean(process.env.NEXT_PUBLIC_STORE_URL),

      emailProviderSource: emailRuntime.source,

      webhookRetrySecretPresent: Boolean(process.env.WEBHOOK_RETRY_SECRET),
    }

    const report = buildLaunchReadinessReport(facts)

    return ok({
      ...report,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[GET /api/readiness]', error)
    return err('Failed to gather launch readiness', 500)
  }
}

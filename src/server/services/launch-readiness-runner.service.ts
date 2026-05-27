import { evaluatePublicStoreUrl } from '@/lib/public-store-url'
import { prisma } from '@/lib/prisma'
import { getEmailJobHealthSnapshot } from '@/server/jobs/email-job-health.service'
import {
  buildLaunchReadinessReport,
  type LaunchReadinessReport,
  type LaunchReadinessFacts,
  type LaunchReadinessSignals,
} from '@/server/services/launch-readiness.service'
import { getStripeSavedStatusSnapshot } from '@/server/payments/stripe-runtime.service'
import { evaluateProductLaunchReadiness } from '@/server/services/product-launch-readiness.service'
import { getProviderStatus } from '@/server/services/provider-connection.service'
import {
  buildShippingSetupStatus,
  getShippingSetupStore,
} from '@/server/shipping/shipping-setup.service'

const OPTIONAL_RUNTIME_TIMEOUT_MS = 350
const OPTIONAL_SHIPPING_TIMEOUT_MS = 500
const OPTIONAL_SIGNAL_TIMEOUT_MS = 350

type TimedOptionalResult<T> = {
  value: T
  timedOut: boolean
  failed: boolean
}

function normalizeRunnerHealth(health: string): LaunchReadinessSignals['runnerHealth'] {
  if (health === 'healthy') return 'healthy'
  if (health === 'stale') return 'warning'
  if (health === 'failing') return 'critical'
  return 'unknown'
}

async function withTimeoutFallback<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<TimedOptionalResult<T>> {
  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({
        value: fallbackValue,
        timedOut: true,
        failed: false,
      })
    }, timeoutMs)

    task()
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({
          value,
          timedOut: false,
          failed: false,
        })
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({
          value: fallbackValue,
          timedOut: false,
          failed: true,
        })
      })
  })
}

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

  const productFacts = evaluateProductLaunchReadiness(activeProducts)
  const activePhysicalProductCount = activeProducts.filter(
    (product) => product.fulfillmentType === 'PHYSICAL'
  ).length

  return {
    ...productFacts,
    activePhysicalProductCount,
  }
}

function mapProviderStateToVerificationStatus(
  state: string | null | undefined
): LaunchReadinessFacts['emailVerificationStatus'] {
  if (state === 'VERIFIED') return 'verified'
  if (state === 'CREDENTIALS_SAVED') return 'configured'
  if (state === 'ERROR') return 'needs_attention'
  if (state === 'NOT_CONFIGURED') return 'needs_setup'
  return 'verification_unavailable'
}

function pickEmailProviderSnapshot(
  statuses: Array<{
    source: 'db' | 'env' | 'none'
    hasCredentials: boolean
    state: string
  }>
) {
  const byPriority = statuses.slice().sort((left, right) => {
    const score = (entry: { source: 'db' | 'env' | 'none'; hasCredentials: boolean; state: string }) => {
      if (entry.source === 'db' && entry.state === 'VERIFIED') return 0
      if (entry.source === 'db' && entry.state === 'CREDENTIALS_SAVED') return 1
      if (entry.source === 'db' && entry.state === 'ERROR') return 2
      if (entry.source === 'env' && entry.hasCredentials) return 3
      if (entry.source === 'db' && entry.hasCredentials) return 4
      if (entry.source === 'env') return 5
      return 6
    }

    return score(left) - score(right)
  })

  return byPriority[0] || null
}

export type LaunchReadinessRunResult = LaunchReadinessReport & {
  checkedAt: string
}

export async function runLaunchReadinessCheck(): Promise<LaunchReadinessRunResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const checkedAt = new Date().toISOString()

  const stripeSavedStatusTask = withTimeoutFallback(
    () => getStripeSavedStatusSnapshot(),
    OPTIONAL_RUNTIME_TIMEOUT_MS,
    {
      source: 'none' as const,
      configured: false,
      checkoutKeysConfigured: false,
      mode: null,
      hasPublishableKey: false,
      hasSecretKey: false,
      hasWebhookSecret: false,
      publishableKeyMasked: null,
      secretKeyMasked: null,
      webhookSecretMasked: null,
      lastVerifiedAt: null,
      lastError: null,
      verificationStatus: 'verification_unavailable' as const,
    }
  )
  const emailStatusTask = withTimeoutFallback(
    async () => {
      const [resend, smtp] = await Promise.all([
        getProviderStatus('RESEND'),
        getProviderStatus('SMTP'),
      ])
      return [resend, smtp]
    },
    OPTIONAL_RUNTIME_TIMEOUT_MS,
    null
  )
  const shippingStatusTask = withTimeoutFallback(
    async () => {
      const shippingStore = await getShippingSetupStore()
      return shippingStore ? await buildShippingSetupStatus(shippingStore) : null
    },
    OPTIONAL_SHIPPING_TIMEOUT_MS,
    null
  )
  const emailHealthTask = withTimeoutFallback(
    () => getEmailJobHealthSnapshot(),
    OPTIONAL_SIGNAL_TIMEOUT_MS,
    null
  )

  const [store, productFacts, stripeWebhookCount, recentPaidOrderCount] = await Promise.all([
    prisma.store.findFirst({
      select: {
        name: true,
        email: true,
        taxEnabled: true,
        defaultTaxRateBps: true,
      },
    }),
    gatherProductFacts(),
    prisma.webhookDelivery.count({
      where: {
        provider: 'stripe',
        eventType: 'payment_intent.succeeded',
        status: 'PROCESSED',
      },
    }),
    prisma.order.count({
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
  ])

  const [stripeSavedStatus, emailStatusResult, shippingStatusResult, emailHealthResult] = await Promise.all([
    stripeSavedStatusTask,
    emailStatusTask,
    shippingStatusTask,
    emailHealthTask,
  ])

  const stripeStatus = stripeSavedStatus.value
  const shippingStatus = shippingStatusResult.value
  const emailStatuses = emailStatusResult.value || []
  const selectedEmailStatus = pickEmailProviderSnapshot(
    emailStatuses.map((status) => ({
      source: status.source,
      hasCredentials: status.hasCredentials,
      state: status.state,
    }))
  )

  const publicStoreUrl = evaluatePublicStoreUrl({
    value: process.env.NEXT_PUBLIC_STORE_URL,
    nodeEnv: process.env.NODE_ENV,
  })

  let signals: LaunchReadinessSignals | undefined
  if (emailHealthResult.value) {
    const emailHealth = emailHealthResult.value
    signals = {
      emailJobHealthLevel: emailHealth.level,
      runnerHealth: normalizeRunnerHealth(emailHealth.runner.health),
      checkedAt,
    }
  } else {
    signals = {
      emailJobHealthLevel: 'unknown',
      runnerHealth: 'unknown',
      checkedAt,
    }
  }

  const facts: LaunchReadinessFacts = {
    storeConfigured: store ? Boolean(store.name?.trim()) : null,
    storeContactConfigured: store ? Boolean(store.email?.trim()) : null,

    stripeRuntimeUnavailable: stripeSavedStatus.timedOut || stripeSavedStatus.failed,
    stripeVerificationStatus: stripeStatus.verificationStatus,
    stripeSource: stripeStatus.source,
    stripeVerified: stripeStatus.verificationStatus === 'verified',
    stripeHasSecretKey: stripeStatus.hasSecretKey,
    stripeHasPublishableKey: stripeStatus.hasPublishableKey,
    stripeHasWebhookSecret: stripeStatus.hasWebhookSecret,
    stripeWebhookDeliveryReceived: stripeWebhookCount > 0,

    shippingStatusUnavailable: shippingStatusResult.timedOut || shippingStatusResult.failed,
    shippingProviderVerificationStatus: shippingStatus?.providerVerificationStatus || null,
    shippingRequired: (productFacts.activePhysicalProductCount ?? 0) > 0,
    shippingMode: shippingStatus?.mode ?? null,
    shippingCanUseManualRates: shippingStatus?.canUseManualRates ?? false,
    shippingCanUseLiveRates: shippingStatus?.canUseLiveRates ?? false,

    taxEnabled: store?.taxEnabled ?? null,
    taxHasRate: (store?.defaultTaxRateBps ?? 0) > 0,

    ...productFacts,

    storefrontUrlConfigured: publicStoreUrl.ready,
    storefrontUrlIssue: publicStoreUrl.issue,
    storefrontUrlMessage: publicStoreUrl.message,

    emailProviderStatusUnavailable: emailStatusResult.timedOut || emailStatusResult.failed,
    emailVerificationStatus: selectedEmailStatus
      ? mapProviderStateToVerificationStatus(selectedEmailStatus.state)
      : 'optional',
    emailProviderSource: selectedEmailStatus?.source || 'none',

    webhookRetrySecretPresent: Boolean(process.env.WEBHOOK_RETRY_SECRET),
    recentPaidOrderExists: recentPaidOrderCount > 0,
  }

  const report = buildLaunchReadinessReport(facts, {
    checkedAt,
    signals,
  })

  return {
    ...report,
    checkedAt,
  }
}

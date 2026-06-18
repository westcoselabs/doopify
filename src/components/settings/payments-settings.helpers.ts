export function normalizeStatusLabel(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim()
}

function formatDisplayCurrency(cents: unknown, currency = 'USD'): string {
  const normalizedCurrency = String(currency || 'USD').toUpperCase()
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100)
}

function formatProviderLabel(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Unknown'
  if (normalized === 'stripe') return 'Stripe'
  if (normalized === 'paypal') return 'PayPal'
  if (normalized === 'manual') return 'Manual'
  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`
}

export const STRIPE_ENV_FALLBACK_VERIFY_COPY =
  'Using .env fallback credentials. Dashboard verification is only available for credentials saved in Settings. Checkout can still use the env fallback keys locally.'

export const STRIPE_UNCONFIGURED_VERIFY_COPY =
  'Save Stripe credentials in Settings before running verification.'

export type StripeVerifyAvailability = {
  canVerify: boolean
  reason: 'db' | 'env' | 'none' | 'restricted' | 'loading'
  helperCopy: string | null
}

/**
 * Decides whether the dashboard "Verify now" action should be offered for
 * Stripe. Verification runs against DB-saved credentials only, so it must stay
 * hidden when the runtime is satisfied by .env fallback keys (or nothing yet) —
 * otherwise the action fails with a misleading "not configured" error even
 * though local checkout works on the env fallback.
 */
export function resolveStripeVerifyAvailability(input: {
  source?: string | null
  restricted?: boolean
  loading?: boolean
}): StripeVerifyAvailability {
  if (input.restricted) {
    return { canVerify: false, reason: 'restricted', helperCopy: null }
  }
  if (input.loading) {
    return { canVerify: false, reason: 'loading', helperCopy: null }
  }

  const source = String(input.source || '').toLowerCase()
  if (source === 'db') {
    return { canVerify: true, reason: 'db', helperCopy: null }
  }
  if (source === 'env') {
    return { canVerify: false, reason: 'env', helperCopy: STRIPE_ENV_FALLBACK_VERIFY_COPY }
  }

  return { canVerify: false, reason: 'none', helperCopy: STRIPE_UNCONFIGURED_VERIFY_COPY }
}

export type StripeProviderActionView = {
  showVerifyButton: boolean
  verifyDisabled: boolean
  note: string | null
}

/**
 * Translates source-aware verify availability into a provider-row view model:
 * which affordance shows in the right-hand actions column (the Verify button,
 * enabled only for DB source; shown-but-disabled when permission-restricted)
 * and which helper note belongs inline in the main content area (env fallback
 * or setup copy). Keeps the note out of the actions column so the row keeps its
 * icon / details / actions horizontal layout.
 */
export function buildStripeProviderActionView(
  availability: StripeVerifyAvailability
): StripeProviderActionView {
  return {
    showVerifyButton: availability.canVerify || availability.reason === 'restricted',
    verifyDisabled: !availability.canVerify,
    note: availability.helperCopy,
  }
}

export function getStripeMethodChips(stripeRuntimeStatus: { source?: string; mode?: string } | null | undefined): string[] {
  const runtimeReady = stripeRuntimeStatus?.source && stripeRuntimeStatus.source !== 'none'
  if (!runtimeReady) {
    return ['Cards', 'Apple Pay', 'Google Pay', 'Link', 'Cash App']
  }

  const chips = ['Cards', 'Google Pay', 'Link']
  chips.push(stripeRuntimeStatus?.mode === 'live' ? 'Apple Pay' : 'Apple Pay (needs live + domain)')
  chips.push(stripeRuntimeStatus?.mode === 'live' ? 'Cash App' : 'Cash App (live mode)')
  return chips
}

export function buildCheckoutMethodStatuses(stripeRuntimeStatus: { source?: string; mode?: string } | null | undefined) {
  const runtimeReady = stripeRuntimeStatus?.source && stripeRuntimeStatus.source !== 'none'
  const liveMode = stripeRuntimeStatus?.mode === 'live'

  return [
    {
      id: 'cards',
      title: 'Credit & debit cards',
      statusLabel: runtimeReady ? 'Active' : 'Needs Stripe',
      statusTone: runtimeReady ? 'success' : 'warning',
      detail: runtimeReady
        ? 'Enabled through Stripe checkout runtime.'
        : 'Available once Stripe checkout has an active runtime source.',
    },
    {
      id: 'apple-pay',
      title: 'Apple Pay',
      statusLabel: !runtimeReady ? 'Needs Stripe' : !liveMode ? 'Requires live mode' : 'Requires domain',
      statusTone: !runtimeReady ? 'warning' : !liveMode ? 'warning' : 'neutral',
      detail: 'Requires Stripe, HTTPS, and payment domain verification.',
    },
    {
      id: 'google-pay',
      title: 'Google Pay',
      statusLabel: runtimeReady ? 'Through Stripe' : 'Needs Stripe',
      statusTone: runtimeReady ? 'neutral' : 'warning',
      detail: 'Appears through Stripe when account and browser eligibility checks pass.',
    },
    {
      id: 'link',
      title: 'Link',
      statusLabel: runtimeReady ? 'Through Stripe' : 'Needs Stripe',
      statusTone: runtimeReady ? 'neutral' : 'warning',
      detail: 'Stripe Link support depends on account eligibility.',
    },
    {
      id: 'cash-app',
      title: 'Cash App Pay',
      statusLabel: !runtimeReady ? 'Needs Stripe' : !liveMode ? 'Requires live mode' : 'Through Stripe',
      statusTone: !runtimeReady || !liveMode ? 'warning' : 'neutral',
      detail: 'Requires eligible Stripe account and live-mode configuration.',
    },
    {
      id: 'paypal',
      title: 'PayPal',
      statusLabel: 'Coming soon',
      statusTone: 'warning',
      detail: 'PayPal checkout remains hidden until runtime payment, webhook, refund, and order finalization support is shipped.',
    },
    {
      id: 'manual-invoice',
      title: 'Manual invoice',
      statusLabel: 'Draft orders',
      statusTone: 'neutral',
      detail: 'Manual payment workflows are currently intended for draft order and invoice collection paths.',
    },
  ]
}

type BuildProviderRowsInput = {
  stripeSetupStatus: { label: string; tone: string; lastVerifiedAt?: string | null }
  stripeCheckoutSourceLabel: string
  stripeRuntimeModeLabel: string
  stripeWebhookSourceLabel: string
  stripeVerificationStatus?: string | null
  stripeSavedStatusLoading?: boolean
  stripeLastCheckedText?: string | null
  stripeMethodChips: string[]
}

export function buildPaymentProviderRows(input: BuildProviderRowsInput) {
  const {
    stripeSetupStatus,
    stripeCheckoutSourceLabel,
    stripeRuntimeModeLabel,
    stripeWebhookSourceLabel,
    stripeVerificationStatus,
    stripeSavedStatusLoading,
    stripeLastCheckedText,
    stripeMethodChips,
  } = input

  return [
    {
      id: 'STRIPE',
      iconText: 'S',
      iconClassName: 'providerIconStripe',
      name: 'Stripe',
      description:
        'Accept cards and eligible Stripe wallet methods like Apple Pay, Google Pay, Link, and Cash App Pay.',
      status: stripeSavedStatusLoading
        ? null
        : {
            label: stripeSetupStatus.label,
            tone: stripeSetupStatus.tone,
          },
      statusLoading: stripeSavedStatusLoading,
      sourceMeta: `Checkout source: ${stripeCheckoutSourceLabel}`,
      statusMeta: `Mode: ${stripeRuntimeModeLabel} • Webhook: ${stripeWebhookSourceLabel}`,
      lastCheckedMeta: stripeLastCheckedText ? `Last checked: ${stripeLastCheckedText}` : null,
      chips: stripeMethodChips,
    },
    {
      id: 'PAYPAL',
      iconText: 'P',
      iconClassName: 'providerIconPayPal',
      name: 'PayPal',
      description: 'Let customers pay with PayPal, Pay Later, and Venmo where eligible.',
      status: {
        label: 'Coming soon',
        tone: 'warning',
      },
      statusLoading: false,
      sourceMeta: 'Runtime support: unavailable',
      statusMeta:
        'Do not enable checkout visibility until payment creation, webhook verification, refund support, and order finalization are shipped.',
      chips: ['PayPal', 'Pay Later', 'Venmo'],
    },
    {
      id: 'MANUAL',
      iconText: 'M',
      iconClassName: 'providerIconManual',
      name: 'Manual payments',
      description: 'Support offline payment collection for draft orders, invoices, and phone-order workflows.',
      status: {
        label: 'Built-in',
        tone: 'neutral',
      },
      statusLoading: false,
      sourceMeta: 'Checkout runtime: draft orders and invoices',
      statusMeta: 'Storefront manual checkout should remain disabled unless a server-owned manual flow is implemented.',
      chips: ['Cash', 'Bank transfer', 'Invoice'],
    },
  ]
}

type OrderPayment = {
  id?: string
  provider?: string
  status?: string
  amountCents?: number
  currency?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  createdAt?: string
}

type PaymentOrder = {
  id?: string
  orderNumber?: string | number
  currency?: string
  createdAt?: string
  payments?: OrderPayment[]
}

export function buildPaymentActivityRowsFromOrders(orders: PaymentOrder[]) {
  const rows: Array<Record<string, unknown>> = []
  for (const order of orders || []) {
    const orderPayments = Array.isArray(order?.payments) ? order.payments : []
    for (const payment of orderPayments) {
      const eventLabel = (() => {
        const normalized = normalizeStatusLabel(payment.status)
        if (normalized === 'paid') return 'Payment captured'
        if (normalized === 'pending') return 'Payment pending'
        if (normalized === 'refunded') return 'Payment refunded'
        if (normalized === 'partially refunded') return 'Payment partially refunded'
        if (normalized === 'failed') return 'Payment failed'
        return 'Payment updated'
      })()

      rows.push({
        id: payment.id || `${order.id || order.orderNumber}-${payment.stripePaymentIntentId || 'payment'}`,
        dateValue: payment.createdAt || order.createdAt || null,
        dateText: payment.createdAt
          ? new Date(payment.createdAt).toLocaleString()
          : order.createdAt
            ? new Date(order.createdAt).toLocaleString()
            : 'Unknown',
        orderText: order.orderNumber ? `#${String(order.orderNumber).replace(/^#/, '')}` : 'Unknown',
        providerText: formatProviderLabel(payment.provider),
        eventText: eventLabel,
        statusText: normalizeStatusLabel(payment.status) || 'unknown',
        amountText: formatDisplayCurrency(payment.amountCents, payment.currency || order.currency || 'USD'),
        referenceText: payment.stripePaymentIntentId || payment.stripeChargeId || payment.id || 'N/A',
      })
    }
  }

  return rows.sort((left, right) => {
    const leftTime = left.dateValue ? new Date(String(left.dateValue)).getTime() : 0
    const rightTime = right.dateValue ? new Date(String(right.dateValue)).getTime() : 0
    return rightTime - leftTime
  })
}


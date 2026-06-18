export const CHECKOUT_STRIPE_MISSING_KEY_COPY =
  'Stripe publishable key is unavailable. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local or save Stripe credentials in Settings.'

function normalizeKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Checkout receives a server-rendered publishable key, but when the page is
 * served before the Stripe runtime resolves (or the prop is empty for any
 * reason) the client should self-heal by fetching /api/checkout/stripe-config.
 * Only fetch when the server prop is genuinely empty.
 */
export function shouldFetchStripeConfigFallback(serverPublishableKey: string | null | undefined): boolean {
  return normalizeKey(serverPublishableKey).length === 0
}

/**
 * The effective publishable key prefers the server prop and falls back to the
 * client-fetched value. Returns '' when neither is available, which the UI
 * treats as "Stripe publishable key unavailable" (never "verify Stripe").
 */
export function resolveEffectivePublishableKey(input: {
  serverPublishableKey?: string | null
  fetchedPublishableKey?: string | null
}): string {
  return normalizeKey(input.serverPublishableKey) || normalizeKey(input.fetchedPublishableKey)
}

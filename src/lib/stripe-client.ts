import 'server-only'
import Stripe from 'stripe'
import { env } from '@/lib/env'

let stripeClient: Stripe | undefined

export function getStripeSdkClient() {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, { timeout: 15_000, maxNetworkRetries: 1 })
  return stripeClient
}

export function getStripePublicConfig() {
  const mode = env.STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(test|live)_/)?.[1]
  return {
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    mode: mode === 'test' || mode === 'live' ? mode : null,
  }
}

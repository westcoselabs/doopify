import { describe, expect, it } from 'vitest'

import {
  CHECKOUT_STRIPE_MISSING_KEY_COPY,
  resolveEffectivePublishableKey,
  shouldFetchStripeConfigFallback,
} from './checkout-stripe-config.helpers'

describe('checkout stripe config helpers', () => {
  it('fetches the fallback config when the server publishable key prop is empty', () => {
    expect(shouldFetchStripeConfigFallback('')).toBe(true)
    expect(shouldFetchStripeConfigFallback('   ')).toBe(true)
    expect(shouldFetchStripeConfigFallback(null)).toBe(true)
    expect(shouldFetchStripeConfigFallback(undefined)).toBe(true)
  })

  it('does not fetch the fallback config when the server prop already has a key', () => {
    expect(shouldFetchStripeConfigFallback('pk_test_123')).toBe(false)
  })

  it('prefers the server prop and falls back to the fetched key', () => {
    expect(
      resolveEffectivePublishableKey({ serverPublishableKey: 'pk_test_server', fetchedPublishableKey: 'pk_test_fetched' })
    ).toBe('pk_test_server')

    expect(
      resolveEffectivePublishableKey({ serverPublishableKey: '', fetchedPublishableKey: 'pk_test_fetched' })
    ).toBe('pk_test_fetched')

    expect(resolveEffectivePublishableKey({ serverPublishableKey: '', fetchedPublishableKey: '' })).toBe('')
  })

  it('uses an env-safe missing-key message that never tells the user to verify Stripe', () => {
    const copy = CHECKOUT_STRIPE_MISSING_KEY_COPY.toLowerCase()
    expect(copy).not.toContain('verify')
    expect(copy).toContain('next_public_stripe_publishable_key')
    expect(copy).toContain('settings')
  })
})

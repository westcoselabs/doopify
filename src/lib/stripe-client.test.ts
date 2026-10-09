import { beforeEach, describe, expect, it, vi } from 'vitest'
const envState = vi.hoisted(() => ({ STRIPE_SECRET_KEY: 'sk_test_env_key' as string | undefined, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public' }))
const stripeCtorSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/env', () => ({ env: envState }))
vi.mock('stripe', () => ({ default: class StripeMock { constructor(key: string) { stripeCtorSpy(key) } } }))
describe('environment Stripe client', () => {
  beforeEach(() => { vi.resetModules(); stripeCtorSpy.mockReset(); envState.STRIPE_SECRET_KEY = 'sk_test_env_key' })
  it('reuses one SDK client configured only from the environment', async () => {
    const { getStripeSdkClient } = await import('./stripe-client')
    expect(getStripeSdkClient()).toBe(getStripeSdkClient())
    expect(stripeCtorSpy).toHaveBeenCalledExactlyOnceWith('sk_test_env_key')
  })
  it('fails when the environment key is absent', async () => {
    envState.STRIPE_SECRET_KEY = undefined
    const { getStripeSdkClient } = await import('./stripe-client')
    expect(() => getStripeSdkClient()).toThrow('STRIPE_SECRET_KEY is not configured')
  })
  it('publishes only the publishable key and mode', async () => {
    const { getStripePublicConfig } = await import('./stripe-client')
    expect(getStripePublicConfig()).toEqual({ publishableKey: 'pk_test_public', mode: 'test' })
  })
})

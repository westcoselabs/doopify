import { describe, expect, it } from 'vitest'

import {
  buildStripeProviderActionView,
  resolveStripeVerifyAvailability,
  STRIPE_ENV_FALLBACK_VERIFY_COPY,
  STRIPE_UNCONFIGURED_VERIFY_COPY,
} from './payments-settings.helpers'

describe('resolveStripeVerifyAvailability', () => {
  it('allows verification only when DB-saved credentials back the runtime', () => {
    expect(resolveStripeVerifyAvailability({ source: 'db' })).toEqual({
      canVerify: true,
      reason: 'db',
      helperCopy: null,
    })
  })

  it('hides verification and explains env fallback when running on .env keys', () => {
    expect(resolveStripeVerifyAvailability({ source: 'env' })).toEqual({
      canVerify: false,
      reason: 'env',
      helperCopy: STRIPE_ENV_FALLBACK_VERIFY_COPY,
    })
  })

  it('hides verification with setup guidance when nothing is configured', () => {
    expect(resolveStripeVerifyAvailability({ source: 'none' })).toEqual({
      canVerify: false,
      reason: 'none',
      helperCopy: STRIPE_UNCONFIGURED_VERIFY_COPY,
    })

    expect(resolveStripeVerifyAvailability({ source: undefined })).toEqual({
      canVerify: false,
      reason: 'none',
      helperCopy: STRIPE_UNCONFIGURED_VERIFY_COPY,
    })
  })

  it('suppresses verification while saved status is still loading', () => {
    expect(resolveStripeVerifyAvailability({ source: 'db', loading: true })).toEqual({
      canVerify: false,
      reason: 'loading',
      helperCopy: null,
    })
  })

  it('suppresses verification (without env copy) when the action is permission-restricted', () => {
    expect(resolveStripeVerifyAvailability({ source: 'env', restricted: true })).toEqual({
      canVerify: false,
      reason: 'restricted',
      helperCopy: null,
    })
  })

  it('never advertises env fallback as a verifiable state', () => {
    const envCopy = STRIPE_ENV_FALLBACK_VERIFY_COPY.toLowerCase()
    expect(envCopy).not.toContain('not configured')
    expect(envCopy).toContain('settings')
  })
})

describe('buildStripeProviderActionView', () => {
  it('shows an enabled Verify button and no inline note for DB source', () => {
    expect(buildStripeProviderActionView(resolveStripeVerifyAvailability({ source: 'db' }))).toEqual({
      showVerifyButton: true,
      verifyDisabled: false,
      note: null,
    })
  })

  it('hides Verify and surfaces the env note inline for env fallback source', () => {
    expect(buildStripeProviderActionView(resolveStripeVerifyAvailability({ source: 'env' }))).toEqual({
      showVerifyButton: false,
      verifyDisabled: true,
      note: STRIPE_ENV_FALLBACK_VERIFY_COPY,
    })
  })

  it('hides Verify and surfaces setup copy inline when nothing is configured', () => {
    expect(buildStripeProviderActionView(resolveStripeVerifyAvailability({ source: 'none' }))).toEqual({
      showVerifyButton: false,
      verifyDisabled: true,
      note: STRIPE_UNCONFIGURED_VERIFY_COPY,
    })
  })

  it('keeps the disabled Verify button (no inline note) for permission-restricted viewers', () => {
    expect(
      buildStripeProviderActionView(resolveStripeVerifyAvailability({ source: 'db', restricted: true }))
    ).toEqual({
      showVerifyButton: true,
      verifyDisabled: true,
      note: null,
    })
  })
})

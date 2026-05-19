import { describe, expect, it } from 'vitest'

import {
  isCheckoutEmailValid,
  normalizeCheckoutEmail,
} from './checkout-create.helpers'

describe('checkout email helpers', () => {
  it('uses trimmed state email when present', () => {
    expect(
      normalizeCheckoutEmail({
        stateEmail: '  shopper@example.com  ',
        formEmail: 'ignored@example.com',
      })
    ).toBe('shopper@example.com')
  })

  it('falls back to form email when state email is empty', () => {
    expect(
      normalizeCheckoutEmail({
        stateEmail: '   ',
        formEmail: 'autofill@example.com',
      })
    ).toBe('autofill@example.com')
  })

  it('returns empty string when neither state nor form email is present', () => {
    expect(
      normalizeCheckoutEmail({
        stateEmail: '',
        formEmail: null,
      })
    ).toBe('')
  })

  it('validates expected email formats', () => {
    expect(isCheckoutEmailValid('shopper@example.com')).toBe(true)
    expect(isCheckoutEmailValid(' shopper@example.com ')).toBe(true)
    expect(isCheckoutEmailValid('not-an-email')).toBe(false)
    expect(isCheckoutEmailValid('')).toBe(false)
  })
})

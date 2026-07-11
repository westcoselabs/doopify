import { describe, expect, it } from 'vitest'

import { createCheckoutStatusAccessToken, hashCheckoutStatusAccessToken } from './checkout-status-access'

describe('checkout status access tokens', () => {
  it('creates high-entropy tokens and stores only a deterministic hash', () => {
    const token = createCheckoutStatusAccessToken()

    expect(token).toHaveLength(43)
    expect(hashCheckoutStatusAccessToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashCheckoutStatusAccessToken(token)).toBe(hashCheckoutStatusAccessToken(token))
  })

  it('rejects short status tokens', () => {
    expect(() => hashCheckoutStatusAccessToken('too-short')).toThrow(/status token is invalid/i)
  })
})

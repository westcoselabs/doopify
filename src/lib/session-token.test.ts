import { describe, expect, it } from 'vitest'

import { hashSessionToken, legacySessionTokenMatches, sessionTokenMatches } from './session-token'

describe('hashSessionToken', () => {
  it('produces a stable one-way SHA-256 digest', () => {
    const token = 'header.payload.signature'

    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).not.toContain(token)
  })

  it('compares hashed and legacy session values without accepting mismatches', () => {
    const token = 'session-token-value'
    expect(sessionTokenMatches(hashSessionToken(token), token)).toBe(true)
    expect(sessionTokenMatches(hashSessionToken(token), 'other-token')).toBe(false)
    expect(legacySessionTokenMatches(token, token)).toBe(true)
    expect(legacySessionTokenMatches(token, 'other-token')).toBe(false)
  })
})

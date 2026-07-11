import { describe, expect, it } from 'vitest'

import { hashSessionToken } from './session-token'

describe('hashSessionToken', () => {
  it('produces a stable one-way SHA-256 digest', () => {
    const token = 'header.payload.signature'

    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).not.toContain(token)
  })
})

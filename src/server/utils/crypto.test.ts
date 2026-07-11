import { afterEach, describe, expect, it } from 'vitest'

import { decrypt, encrypt } from './crypto'

const testEncryptionKey = 'test-encryption-key-at-least-32-characters-long'

afterEach(() => {
  process.env.ENCRYPTION_KEY = testEncryptionKey
})

describe('crypto', () => {
  it('round-trips encrypted values with a configured key', () => {
    process.env.ENCRYPTION_KEY = testEncryptionKey

    const encrypted = encrypt('merchant-secret')

    expect(encrypted).not.toContain('merchant-secret')
    expect(decrypt(encrypted)).toBe('merchant-secret')
  })

  it('fails closed when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY

    expect(() => encrypt('merchant-secret')).toThrow(/ENCRYPTION_KEY must be set/i)
    expect(() => decrypt('legacy-value')).toThrow(/ENCRYPTION_KEY must be set/i)
  })

  it('fails closed when ENCRYPTION_KEY is too short', () => {
    process.env.ENCRYPTION_KEY = 'too-short'

    expect(() => encrypt('merchant-secret')).toThrow(/at least 32 characters/i)
  })
})

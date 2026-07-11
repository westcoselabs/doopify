import crypto from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'

import { decrypt, encrypt, isCurrentEncryptionEnvelope, reEncryptToCurrent } from './crypto'

const testEncryptionKey = 'test-encryption-key-at-least-32-characters-long'

afterEach(() => {
  process.env.ENCRYPTION_KEY = testEncryptionKey
  delete process.env.ENCRYPTION_KEY_PREVIOUS
})

function encryptLegacy(value: string, keySecret: string) {
  const iv = crypto.randomBytes(16)
  const salt = crypto.randomBytes(64)
  const key = crypto.scryptSync(keySecret, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = `${cipher.update(value, 'utf8', 'hex')}${cipher.final('hex')}`
  return `${iv.toString('hex')}:${salt.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext}`
}

describe('crypto', () => {
  it('round-trips encrypted values with a configured key', () => {
    process.env.ENCRYPTION_KEY = testEncryptionKey

    const encrypted = encrypt('merchant-secret')

    expect(encrypted).not.toContain('merchant-secret')
    expect(isCurrentEncryptionEnvelope(encrypted)).toBe(true)
    expect(decrypt(encrypted)).toBe('merchant-secret')
  })

  it('fails closed when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY

    expect(() => encrypt('merchant-secret')).toThrow(/ENCRYPTION_KEY must be a high-entropy/i)
    expect(() => decrypt('legacy-value')).toThrow(/ENCRYPTION_KEY must be a high-entropy/i)
  })

  it('fails closed when ENCRYPTION_KEY is too short', () => {
    process.env.ENCRYPTION_KEY = 'too-short'

    expect(() => encrypt('merchant-secret')).toThrow(/at least 32 characters/i)
  })

  it('reads legacy ciphertext and re-encrypts it in the current envelope', () => {
    const legacy = encryptLegacy('legacy-secret', testEncryptionKey)

    expect(isCurrentEncryptionEnvelope(legacy)).toBe(false)
    expect(decrypt(legacy)).toBe('legacy-secret')
    expect(isCurrentEncryptionEnvelope(reEncryptToCurrent(legacy))).toBe(true)
  })

  it('uses ENCRYPTION_KEY_PREVIOUS only for decryption during rotation', () => {
    const previousKey = 'previous-encryption-key-at-least-32-characters-long'
    process.env.ENCRYPTION_KEY = previousKey
    const encryptedWithPrevious = encrypt('rotate-me')

    process.env.ENCRYPTION_KEY = testEncryptionKey
    process.env.ENCRYPTION_KEY_PREVIOUS = previousKey

    expect(decrypt(encryptedWithPrevious)).toBe('rotate-me')
    const reencrypted = reEncryptToCurrent(encryptedWithPrevious)
    expect(decrypt(reencrypted)).toBe('rotate-me')
  })

  it('rejects a tampered envelope', () => {
    const encrypted = encrypt('merchant-secret')
    expect(() => decrypt(`${encrypted}00`)).toThrow(/cannot be decrypted/i)
  })
})

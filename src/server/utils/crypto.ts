import crypto from 'crypto'
// Native TypeScript CLI imports require the explicit extension.
// @ts-ignore -- shared with the local rotation CLI.
import { parseDataEncryptionKey, type DataEncryptionKeyName } from '../../lib/env-schema.ts'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const CURRENT_ENVELOPE_VERSION = 'v1'

function getEncryptionSecret(name: DataEncryptionKeyName = 'DATA_ENCRYPTION_KEY') {
  return parseDataEncryptionKey(process.env, name)
}

function decryptWithSecret(parts: string[], secret: string) {
  const [ivHex, saltHex, tagHex, text] = parts
  if (!ivHex || !saltHex || !tagHex || text == null) throw new Error('Invalid encrypted text format')
  const key = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), 32)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return `${decipher.update(text, 'hex', 'utf8')}${decipher.final('utf8')}`
}

function parseEncryptedParts(encryptedData: string) {
  const allParts = encryptedData.split(':')
  const isCurrentEnvelope = allParts[0] === CURRENT_ENVELOPE_VERSION
  const parts = isCurrentEnvelope ? allParts.slice(1) : allParts
  if (parts.length !== 4) throw new Error('Invalid encrypted text format')
  return { isCurrentEnvelope, parts }
}

function candidateSecrets() {
  const current = getEncryptionSecret()
  const previous = process.env.DATA_ENCRYPTION_KEY_PREVIOUS?.trim()
  if (!previous) return [current]
  try {
    return [current, getEncryptionSecret('DATA_ENCRYPTION_KEY_PREVIOUS')]
  } catch {
    // A malformed previous key must not weaken current-key encryption.
    return [current]
  }
}

export function encrypt(text: string): string {
  if (!text) return text
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = crypto.scryptSync(getEncryptionSecret(), salt, 32)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = `${cipher.update(text, 'utf8', 'hex')}${cipher.final('hex')}`
  const tag = cipher.getAuthTag()
  return `${CURRENT_ENVELOPE_VERSION}:${iv.toString('hex')}:${salt.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

/** Supports legacy iv:salt:tag:ciphertext values during the rotation window. */
export function decrypt(encryptedData: string): string {
  // Preserve historical plaintext handling only after validating a configured
  // key; callers must never silently use encryption without a key.
  if (!encryptedData || !encryptedData.includes(':')) {
    getEncryptionSecret()
    return encryptedData
  }

  const { parts } = parseEncryptedParts(encryptedData)

  let lastError: unknown
  for (const secret of candidateSecrets()) {
    try {
      return decryptWithSecret(parts, secret)
    } catch (error) {
      lastError = error
    }
  }
  throw new Error('Encrypted value cannot be decrypted with the configured encryption keys.', { cause: lastError })
}

export function isCurrentEncryptionEnvelope(value: string) {
  return value.startsWith(`${CURRENT_ENVELOPE_VERSION}:`)
}

/** Decrypts with DATA_ENCRYPTION_KEY only; it never falls back to the previous key. */
export function decryptWithCurrentEncryptionKey(encryptedData: string): string {
  if (!isCurrentEncryptionEnvelope(encryptedData)) {
    throw new Error('Encrypted value does not use the current envelope version.')
  }
  const { parts } = parseEncryptedParts(encryptedData)
  return decryptWithSecret(parts, getEncryptionSecret())
}

/**
 * Produces the rotation decision used by the re-encryption CLI. A v1 envelope
 * is current only when it decrypts with DATA_ENCRYPTION_KEY itself, not merely when
 * it can be read through DATA_ENCRYPTION_KEY_PREVIOUS.
 */
export function getEncryptionRotationDecision(encryptedData: string) {
  const plaintext = decrypt(encryptedData)
  if (isCurrentEncryptionEnvelope(encryptedData)) {
    try {
      if (decryptWithCurrentEncryptionKey(encryptedData) === plaintext) {
        return { plaintext, needsRotation: false }
      }
    } catch {
      // A versioned envelope that requires DATA_ENCRYPTION_KEY_PREVIOUS must rotate.
    }
  }
  return { plaintext, needsRotation: true }
}

export function reEncryptToCurrent(value: string) {
  return encrypt(decrypt(value))
}

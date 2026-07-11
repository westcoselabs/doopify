import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const CURRENT_ENVELOPE_VERSION = 'v1'

function isUnsafeEncryptionSecret(value: string) {
  const normalized = value.trim().toLowerCase()
  return /default|replace|changeme|example|sample|generate-a-random|insecure/.test(normalized)
}

function getEncryptionSecret(name: 'ENCRYPTION_KEY' | 'ENCRYPTION_KEY_PREVIOUS' = 'ENCRYPTION_KEY') {
  const secret = process.env[name]?.trim()
  if (!secret || secret.length < 32 || isUnsafeEncryptionSecret(secret)) {
    throw new Error(`${name} must be a high-entropy value of at least 32 characters before encrypted data can be used.`)
  }
  return secret
}

function decryptWithSecret(parts: string[], secret: string) {
  const [ivHex, saltHex, tagHex, text] = parts
  if (!ivHex || !saltHex || !tagHex || text == null) throw new Error('Invalid encrypted text format')
  const key = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), 32)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return `${decipher.update(text, 'hex', 'utf8')}${decipher.final('utf8')}`
}

function candidateSecrets() {
  const current = getEncryptionSecret()
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS?.trim()
  if (!previous) return [current]
  try {
    return [current, getEncryptionSecret('ENCRYPTION_KEY_PREVIOUS')]
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

  const allParts = encryptedData.split(':')
  const parts = allParts[0] === CURRENT_ENVELOPE_VERSION ? allParts.slice(1) : allParts
  if (parts.length !== 4) throw new Error('Invalid encrypted text format')

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

export function reEncryptToCurrent(value: string) {
  return encrypt(decrypt(value))
}

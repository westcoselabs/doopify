import { createHash, timingSafeEqual } from 'node:crypto'

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionTokenMatches(expectedHash: string | null | undefined, token: string) {
  if (!expectedHash) return false
  const actualHash = hashSessionToken(token)
  const expected = Buffer.from(expectedHash, 'utf8')
  const actual = Buffer.from(actualHash, 'utf8')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function legacySessionTokenMatches(expectedToken: string | null | undefined, token: string) {
  if (!expectedToken) return false
  const expected = Buffer.from(expectedToken, 'utf8')
  const actual = Buffer.from(token, 'utf8')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

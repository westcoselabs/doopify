import { createHash, randomBytes } from 'node:crypto'

const MINIMUM_STATUS_ACCESS_TOKEN_LENGTH = 32

export function createCheckoutStatusAccessToken() {
  return randomBytes(32).toString('base64url')
}

export function hashCheckoutStatusAccessToken(value: string) {
  const token = value.trim()
  if (token.length < MINIMUM_STATUS_ACCESS_TOKEN_LENGTH) {
    throw new Error('Checkout status token is invalid')
  }

  return createHash('sha256').update(token).digest('hex')
}

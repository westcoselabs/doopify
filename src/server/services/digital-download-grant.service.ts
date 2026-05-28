import { createHash, randomBytes } from 'node:crypto'

export const DEFAULT_DIGITAL_DOWNLOAD_LIMIT = 5
export const DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS = 30

export type DigitalGrantUsageInput = {
  expiresAt: Date
  revokedAt: Date | null
  downloadLimit: number
  downloadCount: number
}

export type DigitalGrantPolicy = {
  downloadLimit: number
  expiresAt: Date
}

export function createDownloadToken() {
  return randomBytes(32).toString('hex')
}

export function hashDownloadToken(token: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) {
    throw new Error('Download token is required')
  }

  return createHash('sha256')
    .update(`doopify:digital-download:${normalizedToken}`, 'utf8')
    .digest('hex')
}

export function buildDigitalGrantExpiry(
  now: Date = new Date(),
  days: number = DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS
) {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS
  return new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000)
}

export function getDefaultDigitalGrantPolicy(now: Date = new Date()): DigitalGrantPolicy {
  return {
    downloadLimit: DEFAULT_DIGITAL_DOWNLOAD_LIMIT,
    expiresAt: buildDigitalGrantExpiry(now, DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS),
  }
}

export function isDigitalGrantExpired(grant: Pick<DigitalGrantUsageInput, 'expiresAt'>, now: Date = new Date()) {
  return grant.expiresAt.getTime() <= now.getTime()
}

export function isDigitalGrantRevoked(grant: Pick<DigitalGrantUsageInput, 'revokedAt'>) {
  return Boolean(grant.revokedAt)
}

export function hasDigitalGrantDownloadsRemaining(
  grant: Pick<DigitalGrantUsageInput, 'downloadCount' | 'downloadLimit'>
) {
  return grant.downloadCount < grant.downloadLimit
}

export function canUseDigitalDownloadGrant(grant: DigitalGrantUsageInput, now: Date = new Date()) {
  if (isDigitalGrantRevoked(grant)) return false
  if (isDigitalGrantExpired(grant, now)) return false
  if (!hasDigitalGrantDownloadsRemaining(grant)) return false
  return true
}

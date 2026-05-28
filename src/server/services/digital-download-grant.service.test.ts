import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS,
  DEFAULT_DIGITAL_DOWNLOAD_LIMIT,
  canUseDigitalDownloadGrant,
  getDefaultDigitalGrantPolicy,
  hashDownloadToken,
} from './digital-download-grant.service'

const NOW = new Date('2026-05-27T12:00:00.000Z')

describe('digital-download-grant.service', () => {
  it('default policy is 5 downloads and 30 days', () => {
    const policy = getDefaultDigitalGrantPolicy(NOW)
    const expectedExpiry = new Date(
      NOW.getTime() + DEFAULT_DIGITAL_DOWNLOAD_EXPIRES_DAYS * 24 * 60 * 60 * 1000
    )

    expect(policy.downloadLimit).toBe(DEFAULT_DIGITAL_DOWNLOAD_LIMIT)
    expect(policy.expiresAt.toISOString()).toBe(expectedExpiry.toISOString())
  })

  it('token hashing does not return raw token', () => {
    const token = 'raw_download_token'
    const hash = hashDownloadToken(token)

    expect(hash).not.toBe(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('active grant can be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-06-26T12:00:00.000Z'),
        revokedAt: null,
        downloadLimit: 5,
        downloadCount: 1,
      }, NOW)
    ).toBe(true)
  })

  it('expired grant cannot be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-05-20T12:00:00.000Z'),
        revokedAt: null,
        downloadLimit: 5,
        downloadCount: 1,
      }, NOW)
    ).toBe(false)
  })

  it('revoked grant cannot be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-06-26T12:00:00.000Z'),
        revokedAt: new Date('2026-05-22T12:00:00.000Z'),
        downloadLimit: 5,
        downloadCount: 1,
      }, NOW)
    ).toBe(false)
  })

  it('exhausted grant cannot be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-06-26T12:00:00.000Z'),
        revokedAt: null,
        downloadLimit: 5,
        downloadCount: 6,
      }, NOW)
    ).toBe(false)
  })

  it('last download below limit can still be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-06-26T12:00:00.000Z'),
        revokedAt: null,
        downloadLimit: 5,
        downloadCount: 4,
      }, NOW)
    ).toBe(true)
  })

  it('downloadCount equal to limit cannot be used', () => {
    expect(
      canUseDigitalDownloadGrant({
        expiresAt: new Date('2026-06-26T12:00:00.000Z'),
        revokedAt: null,
        downloadLimit: 5,
        downloadCount: 5,
      }, NOW)
    ).toBe(false)
  })
})

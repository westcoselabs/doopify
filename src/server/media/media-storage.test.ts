import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getMediaPublicUrl,
  getMediaStorageAdapter,
  getMediaStorageAdapterForProvider,
  resetMediaStorageAdapterCacheForTests,
} from './media-storage'

describe('media storage resolver', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMediaStorageAdapterCacheForTests()
  })

  it('defaults to Postgres storage when no provider is configured', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', '')

    expect(getMediaStorageAdapter().provider).toBe('postgres')
  })

  it('uses Postgres storage when explicitly configured', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'postgres')

    expect(getMediaStorageAdapter().provider).toBe('postgres')
  })

  it('throws a config error when s3 is configured without required env vars', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 's3')

    expect(() => getMediaStorageAdapter()).toThrowError(
      'MEDIA_STORAGE_PROVIDER=s3 requires MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.'
    )
  })

  it('uses s3 storage when provider and required env vars are configured', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 's3')
    vi.stubEnv('MEDIA_S3_REGION', 'auto')
    vi.stubEnv('MEDIA_S3_BUCKET', 'doopify-media')
    vi.stubEnv('MEDIA_S3_ACCESS_KEY_ID', 'key')
    vi.stubEnv('MEDIA_S3_SECRET_ACCESS_KEY', 'secret')

    expect(getMediaStorageAdapter().provider).toBe('s3')
  })

  it('uses Vercel Blob storage when provider is vercel-blob and token is configured', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'vercel-blob')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_token')

    expect(getMediaStorageAdapter().provider).toBe('vercel-blob')
  })

  it('supports MEDIA_STORAGE_PROVIDER=blob alias', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'blob')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_token')

    expect(getMediaStorageAdapter().provider).toBe('vercel-blob')
  })

  it('throws a config error when Vercel Blob provider is configured without token', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'vercel-blob')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')

    expect(() => getMediaStorageAdapter()).toThrowError(
      'MEDIA_STORAGE_PROVIDER=vercel-blob requires BLOB_READ_WRITE_TOKEN.'
    )
  })

  it('uses legacy MEDIA_S3_PUBLIC_URL as fallback and warns once', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 's3')
    vi.stubEnv('MEDIA_S3_REGION', 'auto')
    vi.stubEnv('MEDIA_S3_BUCKET', 'doopify-media')
    vi.stubEnv('MEDIA_S3_ACCESS_KEY_ID', 'key')
    vi.stubEnv('MEDIA_S3_SECRET_ACCESS_KEY', 'secret')
    vi.stubEnv('MEDIA_S3_PUBLIC_URL', 'https://legacy-cdn.example.com/media')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(getMediaStorageAdapter().provider).toBe('s3')
    expect(warnSpy).toHaveBeenCalledWith(
      '[media-storage] MEDIA_S3_PUBLIC_URL is deprecated. Use MEDIA_PUBLIC_BASE_URL instead.'
    )

    warnSpy.mockClear()
    expect(getMediaStorageAdapter().provider).toBe('s3')
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('prefers MEDIA_PUBLIC_BASE_URL over legacy MEDIA_S3_PUBLIC_URL without warning', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 's3')
    vi.stubEnv('MEDIA_S3_REGION', 'auto')
    vi.stubEnv('MEDIA_S3_BUCKET', 'doopify-media')
    vi.stubEnv('MEDIA_S3_ACCESS_KEY_ID', 'key')
    vi.stubEnv('MEDIA_S3_SECRET_ACCESS_KEY', 'secret')
    vi.stubEnv('MEDIA_PUBLIC_BASE_URL', 'https://cdn.example.com/media')
    vi.stubEnv('MEDIA_S3_PUBLIC_URL', 'https://legacy-cdn.example.com/media')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(getMediaStorageAdapter().provider).toBe('s3')
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[media-storage] MEDIA_S3_PUBLIC_URL is deprecated. Use MEDIA_PUBLIC_BASE_URL instead.'
    )
    warnSpy.mockRestore()
  })

  it('falls back to Postgres for unsupported providers', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'r2')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(getMediaStorageAdapter().provider).toBe('postgres')
    expect(warnSpy).toHaveBeenCalledWith(
      '[media-storage] MEDIA_STORAGE_PROVIDER=r2 is unsupported. Falling back to Postgres storage.'
    )
    warnSpy.mockRestore()
  })

  it('warns in production when MEDIA_STORAGE_PROVIDER is unset and Postgres fallback is used', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(getMediaStorageAdapter().provider).toBe('postgres')
    expect(warnSpy).toHaveBeenCalledWith(
      '[media-storage] MEDIA_STORAGE_PROVIDER is unset in production. Falling back to Postgres media storage (not recommended for production scale).'
    )

    warnSpy.mockClear()
    expect(getMediaStorageAdapter().provider).toBe('postgres')
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns stable app media URLs', () => {
    expect(getMediaPublicUrl('asset_123')).toBe('/api/media/asset_123')
  })

  it('resolves storage adapters by explicit provider', () => {
    vi.stubEnv('MEDIA_S3_REGION', 'auto')
    vi.stubEnv('MEDIA_S3_BUCKET', 'doopify-media')
    vi.stubEnv('MEDIA_S3_ACCESS_KEY_ID', 'key')
    vi.stubEnv('MEDIA_S3_SECRET_ACCESS_KEY', 'secret')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_token')

    expect(getMediaStorageAdapterForProvider('postgres').provider).toBe('postgres')
    expect(getMediaStorageAdapterForProvider('s3').provider).toBe('s3')
    expect(getMediaStorageAdapterForProvider('vercel-blob').provider).toBe('vercel-blob')
  })

  it('throws when resolving an unsupported explicit provider', () => {
    expect(() => getMediaStorageAdapterForProvider('r2')).toThrowError(
      'Unsupported media storage provider: r2'
    )
  })
})

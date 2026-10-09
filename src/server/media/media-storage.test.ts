vi.mock('@/lib/env', () => ({ env: new Proxy({}, { get: (_, name) => name === 'MEDIA_STORAGE_PROVIDER' ? process.env.MEDIA_STORAGE_PROVIDER || 'postgres' : process.env[String(name)] }) }))
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

  it('throws a config error when Vercel Blob provider is configured without token', () => {
    vi.stubEnv('MEDIA_STORAGE_PROVIDER', 'vercel-blob')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')

    expect(() => getMediaStorageAdapter()).toThrowError(
      'MEDIA_STORAGE_PROVIDER=vercel-blob requires BLOB_READ_WRITE_TOKEN.'
    )
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

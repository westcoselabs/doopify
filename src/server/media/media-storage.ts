import { env } from '@/lib/env'
import { getS3StorageConfig } from './s3-client'
import { postgresMediaStorageAdapter } from '@/server/media/postgres-media-storage'
import { createS3MediaStorageAdapter } from '@/server/media/s3-media-storage'
import type { MediaStorageAdapter } from '@/server/media/storage-adapter'
import {
  createVercelBlobMediaStorageAdapter,
  type VercelBlobMediaStorageConfig,
} from '@/server/media/vercel-blob-media-storage'

let cachedS3Adapter: MediaStorageAdapter | null = null
let cachedBlobAdapter: MediaStorageAdapter | null = null

export class MediaStorageConfigError extends Error {
  provider: string
  constructor(provider: string, message: string) {
    super(message)
    this.name = 'MediaStorageConfigError'
    this.provider = provider
  }
}

function getVercelBlobConfigFromEnv(): VercelBlobMediaStorageConfig | null {
  const token = env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return null
  }

  return { token }
}

function mediaUrl(assetId: string) {
  return `/api/media/${assetId}`
}

function normalizeMediaProvider(provider: string | null | undefined) {
  const value = provider?.trim().toLowerCase()
  if (!value || value === 'postgres') return 'postgres'
  if (value === 's3') return 's3'
  if (value === 'vercel-blob' || value === 'blob') return 'vercel-blob'
  return null
}

export function getMediaStorageAdapterForProvider(provider: string | null | undefined): MediaStorageAdapter {
  const normalizedProvider = normalizeMediaProvider(provider)
  if (normalizedProvider === 'postgres') {
    return postgresMediaStorageAdapter
  }

  if (normalizedProvider === 's3') {
    const config = getS3StorageConfig()
    if (!config) {
      throw new MediaStorageConfigError(
        's3',
        'MEDIA_STORAGE_PROVIDER=s3 requires MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.'
      )
    }

    cachedS3Adapter ??= createS3MediaStorageAdapter(config)
    return cachedS3Adapter
  }

  if (normalizedProvider === 'vercel-blob') {
    const config = getVercelBlobConfigFromEnv()
    if (!config) {
      throw new MediaStorageConfigError(
        'vercel-blob',
        'MEDIA_STORAGE_PROVIDER=vercel-blob requires BLOB_READ_WRITE_TOKEN.'
      )
    }

    cachedBlobAdapter ??= createVercelBlobMediaStorageAdapter(config)
    return cachedBlobAdapter
  }

  throw new MediaStorageConfigError('unknown', `Unsupported media storage provider: ${provider || 'unknown'}`)
}

export function getMediaStorageAdapter(): MediaStorageAdapter {
  return getMediaStorageAdapterForProvider(env.MEDIA_STORAGE_PROVIDER)
}

export function getMediaPublicUrl(assetId: string) {
  return mediaUrl(assetId)
}

export function resetMediaStorageAdapterCacheForTests() {
  cachedS3Adapter = null
  cachedBlobAdapter = null
}

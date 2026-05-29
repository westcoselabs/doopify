import { postgresMediaStorageAdapter } from '@/server/media/postgres-media-storage'
import { createS3MediaStorageAdapter, type S3MediaStorageConfig } from '@/server/media/s3-media-storage'
import type { MediaStorageAdapter } from '@/server/media/storage-adapter'
import {
  createVercelBlobMediaStorageAdapter,
  type VercelBlobMediaStorageConfig,
} from '@/server/media/vercel-blob-media-storage'

let cachedS3Adapter: MediaStorageAdapter | null = null
let cachedBlobAdapter: MediaStorageAdapter | null = null
let warnedLegacyMediaPublicUrlEnv = false
let warnedProductionPostgresDefault = false

export class MediaStorageConfigError extends Error {
  provider: string
  constructor(provider: string, message: string) {
    super(message)
    this.name = 'MediaStorageConfigError'
    this.provider = provider
  }
}

function resolveMediaPublicBaseUrlFromEnv() {
  const canonical = process.env.MEDIA_PUBLIC_BASE_URL?.trim()
  if (canonical) {
    return canonical
  }

  const legacy = process.env.MEDIA_S3_PUBLIC_URL?.trim()
  if (legacy) {
    if (!warnedLegacyMediaPublicUrlEnv) {
      console.warn('[media-storage] MEDIA_S3_PUBLIC_URL is deprecated. Use MEDIA_PUBLIC_BASE_URL instead.')
      warnedLegacyMediaPublicUrlEnv = true
    }
    return legacy
  }

  return undefined
}

function getS3ConfigFromEnv(): S3MediaStorageConfig | null {
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim() || undefined
  const region = process.env.MEDIA_S3_REGION?.trim()
  const bucket = process.env.MEDIA_S3_BUCKET?.trim()
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim()
  const publicBaseUrl = resolveMediaPublicBaseUrlFromEnv()

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    return null
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  }
}

function getVercelBlobConfigFromEnv(): VercelBlobMediaStorageConfig | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
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
    const config = getS3ConfigFromEnv()
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
  const provider = process.env.MEDIA_STORAGE_PROVIDER?.trim()

  if (!provider) {
    if (!provider && process.env.NODE_ENV === 'production' && !warnedProductionPostgresDefault) {
      console.warn(
        '[media-storage] MEDIA_STORAGE_PROVIDER is unset in production. Falling back to Postgres media storage (not recommended for production scale).'
      )
      warnedProductionPostgresDefault = true
    }
    return postgresMediaStorageAdapter
  }

  try {
    return getMediaStorageAdapterForProvider(provider)
  } catch (error) {
    if (!(error instanceof MediaStorageConfigError) || error.provider !== 'unknown') {
      throw error
    }
  }

  console.warn(`[media-storage] MEDIA_STORAGE_PROVIDER=${provider.toLowerCase()} is unsupported. Falling back to Postgres storage.`)
  return postgresMediaStorageAdapter
}

export function getMediaPublicUrl(assetId: string) {
  return mediaUrl(assetId)
}

export function resetMediaStorageAdapterCacheForTests() {
  cachedS3Adapter = null
  cachedBlobAdapter = null
  warnedLegacyMediaPublicUrlEnv = false
  warnedProductionPostgresDefault = false
}

import { createS3Client } from './s3-client'
import type { Readable } from 'node:stream'

import { prisma } from '@/lib/prisma'
import {
  PUBLIC_MEDIA_CACHE_CONTROL,
  type GetMediaObjectResult,
  type MediaStorageAdapter,
  type PutMediaObjectInput,
  type PutMediaObjectResult,
} from '@/server/media/storage-adapter'

export type S3MediaStorageConfig = {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl?: string
}

type MinioClientLike = {
  putObject(
    bucketName: string,
    objectName: string,
    stream: Buffer | string | Readable,
    size?: number,
    metaData?: Record<string, string>
  ): Promise<unknown>
  getObject(bucketName: string, objectName: string): Promise<Readable>
  removeObject(bucketName: string, objectName: string): Promise<void>
}

type MediaAssetCreateResult = {
  id: string
  filename: string
  altText: string | null
  mimeType: string
  size: number | null
  createdAt: Date
}

type MediaAssetReadResult = {
  id: string
  filename: string
  mimeType: string
  size: number | null
  storageProvider: string
  storageKey: string | null
  storageBucket: string | null
  publicUrl: string | null
}

type PrismaMediaClient = {
  mediaAsset: {
    create(args: unknown): Promise<MediaAssetCreateResult>
    update(args: unknown): Promise<MediaAssetCreateResult>
    findUnique(args: unknown): Promise<MediaAssetReadResult | null>
    delete(args: unknown): Promise<unknown>
  }
}

type S3MediaAdapterDeps = {
  prismaClient: PrismaMediaClient
  objectClient: MinioClientLike
}

function mediaUrl(assetId: string) {
  return `/api/media/${assetId}`
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function sanitizeFilename(filename: string) {
  const dotIndex = filename.lastIndexOf('.')
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : ''

  const safeBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const safeExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const finalBase = safeBase || 'asset'
  return safeExt ? `${finalBase}.${safeExt}` : finalBase
}

export function buildS3MediaStorageKey(assetId: string, filename: string) {
  return `media/${assetId}/${sanitizeFilename(filename)}`
}

function resolvePublicUrl(config: S3MediaStorageConfig, key: string) {
  if (!config.publicBaseUrl) {
    return null
  }

  const base = trimSlash(config.publicBaseUrl)
  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  return `${base}/${encodedKey}`
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export function createS3MediaStorageAdapter(
  config: S3MediaStorageConfig,
  deps: S3MediaAdapterDeps = {
    prismaClient: prisma as unknown as PrismaMediaClient,
    objectClient: createS3Client(config),
  }
): MediaStorageAdapter {
  return {
    provider: 's3',

    async put(input: PutMediaObjectInput): Promise<PutMediaObjectResult> {
      const asset = await deps.prismaClient.mediaAsset.create({
        data: {
          filename: input.filename,
          altText: input.altText || undefined,
          mimeType: input.mimeType,
          size: input.size,
          data: null,
          storageProvider: 's3',
          storageBucket: config.bucket,
          ...(input.productId && {
            productMedia: {
              create: {
                productId: input.productId,
                position: 0,
              },
            },
          }),
        },
      })

      const key = buildS3MediaStorageKey(asset.id, input.filename)
      const publicUrl = resolvePublicUrl(config, key)

      try {
        await deps.objectClient.putObject(config.bucket, key, input.buffer, input.buffer.length, {
          'Content-Type': input.mimeType,
          'Cache-Control': PUBLIC_MEDIA_CACHE_CONTROL,
          'x-amz-meta-asset-id': asset.id,
          'x-amz-meta-filename': input.filename,
        })
      } catch (error) {
        try {
          await deps.prismaClient.mediaAsset.delete({ where: { id: asset.id } })
        } catch (cleanupError) {
          console.error('[media-storage] Failed to cleanup media metadata after object-store put failure', cleanupError)
        }

        throw error
      }

      const saved = await deps.prismaClient.mediaAsset.update({
        where: { id: asset.id },
        data: {
          storageKey: key,
          storageBucket: config.bucket,
          publicUrl,
        },
      })

      return {
        id: saved.id,
        provider: 's3',
        url: mediaUrl(saved.id),
        filename: saved.filename,
        altText: saved.altText,
        mimeType: saved.mimeType,
        size: saved.size,
        createdAt: saved.createdAt,
        linkedProducts: input.productId ? 1 : 0,
      }
    },

    async get(assetId: string): Promise<GetMediaObjectResult | null> {
      const asset = await deps.prismaClient.mediaAsset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          storageProvider: true,
          storageKey: true,
          storageBucket: true,
          publicUrl: true,
        },
      })

      if (!asset) {
        return null
      }

      if (asset.storageProvider !== 's3') {
        throw new Error(`S3 adapter cannot read non-S3 media asset ${asset.id}`)
      }

      if (asset.publicUrl) {
        return {
          redirectUrl: asset.publicUrl,
          mimeType: asset.mimeType,
          filename: asset.filename,
          size: asset.size,
          cacheControl: PUBLIC_MEDIA_CACHE_CONTROL,
        }
      }

      if (!asset.storageKey) {
        throw new Error(`Media asset ${asset.id} is missing storage key metadata`)
      }

      const body = await deps.objectClient.getObject(asset.storageBucket || config.bucket, asset.storageKey)

      return {
        body: await streamToBuffer(body),
        mimeType: asset.mimeType,
        filename: asset.filename,
        size: asset.size,
        cacheControl: PUBLIC_MEDIA_CACHE_CONTROL,
      }
    },

    async delete(assetId: string): Promise<void> {
      const asset = await deps.prismaClient.mediaAsset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          storageProvider: true,
          storageKey: true,
          storageBucket: true,
          filename: true,
          mimeType: true,
          size: true,
          publicUrl: true,
        },
      })

      if (!asset) {
        throw new Error('Asset not found')
      }

      if (asset.storageProvider !== 's3') {
        throw new Error(`S3 adapter cannot delete non-S3 media asset ${asset.id}`)
      }

      if (asset.storageKey) {
        await deps.objectClient.removeObject(asset.storageBucket || config.bucket, asset.storageKey)
      }

      await deps.prismaClient.mediaAsset.delete({ where: { id: assetId } })
    },

    getPublicUrl(assetId: string) {
      return mediaUrl(assetId)
    },
  }
}

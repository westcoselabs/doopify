import { DigitalDownloadEventResult, type Prisma } from '@prisma/client'
import { Client as MinioClient } from 'minio'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'

import { prisma } from '@/lib/prisma'
import {
  hasDigitalGrantDownloadsRemaining,
  hashDownloadToken,
  isDigitalGrantExpired,
  isDigitalGrantRevoked,
} from '@/server/services/digital-download-grant.service'

type DownloadAttemptResult =
  | 'ALLOWED'
  | 'INVALID_TOKEN'
  | 'DENIED_EXPIRED'
  | 'DENIED_REVOKED'
  | 'DENIED_EXHAUSTED'
  | 'DENIED_OTHER'

export type ResolveDigitalDownloadInput = {
  token: string
  ipAddress?: string | null
  userAgent?: string | null
  now?: Date
}

export type ResolveDigitalDownloadResult =
  | {
      ok: true
      result: 'ALLOWED'
      file: {
        fileName: string
        contentType: string
        byteSize: number
        bytes: Buffer
      }
      grantId: string
    }
  | {
      ok: false
      result: Exclude<DownloadAttemptResult, 'ALLOWED'>
      grantId?: string
    }

type GrantWithAsset = {
  id: string
  tokenHash: string
  downloadLimit: number
  downloadCount: number
  expiresAt: Date
  revokedAt: Date | null
  digitalAsset: {
    id: string
    fileName: string
    contentType: string
    byteSize: number
    storageProvider: string
    storageKey: string
  } | null
}

type S3PrivateConfig = {
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  endpoint?: string
}

function toEventResult(value: Extract<DownloadAttemptResult, `DENIED_${string}` | 'ALLOWED'>): DigitalDownloadEventResult {
  switch (value) {
    case 'ALLOWED':
      return DigitalDownloadEventResult.ALLOWED
    case 'DENIED_EXPIRED':
      return DigitalDownloadEventResult.DENIED_EXPIRED
    case 'DENIED_REVOKED':
      return DigitalDownloadEventResult.DENIED_REVOKED
    case 'DENIED_EXHAUSTED':
      return DigitalDownloadEventResult.DENIED_EXHAUSTED
    default:
      return DigitalDownloadEventResult.DENIED_OTHER
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function parsePrivateStorageKeyToSegments(storageKey: string) {
  const normalized = String(storageKey || '').replace(/\\/g, '/').trim()
  if (!normalized) {
    throw new Error('Private digital asset storage key is missing')
  }

  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length) {
    throw new Error('Private digital asset storage key is invalid')
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('Private digital asset storage key is invalid')
    }
  }

  return segments
}

function resolvePrivateLocalRootDirectory() {
  const baseDirectory = process.env.DIGITAL_ASSET_LOCAL_DIR?.trim() || '.private-digital-assets'
  return path.resolve(baseDirectory)
}

function resolveContainedPrivateLocalPath(storageKey: string) {
  const root = resolvePrivateLocalRootDirectory()
  const segments = parsePrivateStorageKeyToSegments(storageKey)
  const targetPath = path.resolve(root, ...segments)
  const normalizedRoot = `${root}${path.sep}`

  if (targetPath !== root && !targetPath.startsWith(normalizedRoot)) {
    throw new Error('Private digital asset storage key is invalid')
  }

  return targetPath
}

async function readFromLocalPrivateStorage(storageKey: string) {
  const filePath = resolveContainedPrivateLocalPath(storageKey)
  return readFile(filePath)
}

function resolveS3PrivateConfig(): S3PrivateConfig {
  const region = process.env.MEDIA_S3_REGION?.trim()
  const bucket = process.env.MEDIA_S3_BUCKET?.trim()
  const accessKey = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim()
  const secretKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim()
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim()

  if (!region || !bucket || !accessKey || !secretKey) {
    throw new Error(
      'S3 private digital download requires MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.'
    )
  }

  return {
    region,
    bucket,
    accessKey,
    secretKey,
    endpoint: endpoint || undefined,
  }
}

function createS3PrivateClient(config: S3PrivateConfig) {
  if (!config.endpoint) {
    return new MinioClient({
      endPoint: 's3.amazonaws.com',
      useSSL: true,
      region: config.region,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      pathStyle: false,
    })
  }

  const normalizedEndpoint = config.endpoint.includes('://')
    ? config.endpoint
    : `https://${config.endpoint}`
  const parsed = new URL(normalizedEndpoint)

  return new MinioClient({
    endPoint: parsed.hostname,
    useSSL: parsed.protocol === 'https:',
    port: parsed.port ? Number(parsed.port) : undefined,
    region: config.region,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    pathStyle: true,
  })
}

async function readFromS3PrivateStorage(storageKey: string) {
  const config = resolveS3PrivateConfig()
  const client = createS3PrivateClient(config)
  const objectStream = await client.getObject(config.bucket, storageKey)
  return streamToBuffer(objectStream)
}

async function readPrivateDigitalAssetBytes(asset: NonNullable<GrantWithAsset['digitalAsset']>) {
  if (!asset.storageKey?.trim()) {
    throw new Error('Digital asset storage key is missing')
  }

  if (asset.storageProvider === 'local-private') {
    return readFromLocalPrivateStorage(asset.storageKey)
  }

  if (asset.storageProvider === 's3-private') {
    return readFromS3PrivateStorage(asset.storageKey)
  }

  throw new Error(`Digital asset storage provider ${asset.storageProvider} is not supported for secure downloads`)
}

async function logDownloadEvent(input: {
  tx: Prisma.TransactionClient
  grantId: string
  result: Extract<DownloadAttemptResult, `DENIED_${string}` | 'ALLOWED'>
  ipAddress?: string | null
  userAgent?: string | null
}) {
  await input.tx.digitalDownloadEvent.create({
    data: {
      grantId: input.grantId,
      result: toEventResult(input.result),
      ipAddress: input.ipAddress?.trim() || null,
      userAgent: input.userAgent?.trim() || null,
    },
  })
}

export async function resolveDigitalDownloadByToken(
  input: ResolveDigitalDownloadInput
): Promise<ResolveDigitalDownloadResult> {
  const now = input.now ?? new Date()

  let tokenHash: string
  try {
    tokenHash = hashDownloadToken(input.token)
  } catch {
    return {
      ok: false,
      result: 'INVALID_TOKEN',
    }
  }

  const grant = (await prisma.digitalDownloadGrant.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tokenHash: true,
      downloadLimit: true,
      downloadCount: true,
      expiresAt: true,
      revokedAt: true,
      digitalAsset: {
        select: {
          id: true,
          fileName: true,
          contentType: true,
          byteSize: true,
          storageProvider: true,
          storageKey: true,
        },
      },
    },
  })) as GrantWithAsset | null

  if (!grant) {
    return {
      ok: false,
      result: 'INVALID_TOKEN',
    }
  }

  if (isDigitalGrantRevoked(grant)) {
    await prisma.digitalDownloadEvent.create({
      data: {
        grantId: grant.id,
        result: DigitalDownloadEventResult.DENIED_REVOKED,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    })

    return {
      ok: false,
      result: 'DENIED_REVOKED',
      grantId: grant.id,
    }
  }

  if (isDigitalGrantExpired(grant, now)) {
    await prisma.digitalDownloadEvent.create({
      data: {
        grantId: grant.id,
        result: DigitalDownloadEventResult.DENIED_EXPIRED,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    })

    return {
      ok: false,
      result: 'DENIED_EXPIRED',
      grantId: grant.id,
    }
  }

  if (!hasDigitalGrantDownloadsRemaining(grant)) {
    await prisma.digitalDownloadEvent.create({
      data: {
        grantId: grant.id,
        result: DigitalDownloadEventResult.DENIED_EXHAUSTED,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    })

    return {
      ok: false,
      result: 'DENIED_EXHAUSTED',
      grantId: grant.id,
    }
  }

  if (!grant.digitalAsset) {
    await prisma.digitalDownloadEvent.create({
      data: {
        grantId: grant.id,
        result: DigitalDownloadEventResult.DENIED_OTHER,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    })

    return {
      ok: false,
      result: 'DENIED_OTHER',
      grantId: grant.id,
    }
  }

  let fileBytes: Buffer
  try {
    fileBytes = await readPrivateDigitalAssetBytes(grant.digitalAsset)
  } catch (error) {
    console.error('[digital-download-access] Failed to read private digital asset', {
      grantId: grant.id,
      assetId: grant.digitalAsset.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })

    await prisma.digitalDownloadEvent.create({
      data: {
        grantId: grant.id,
        result: DigitalDownloadEventResult.DENIED_OTHER,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    })

    return {
      ok: false,
      result: 'DENIED_OTHER',
      grantId: grant.id,
    }
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.digitalDownloadGrant.updateMany({
      where: {
        id: grant.id,
        revokedAt: null,
        expiresAt: { gt: now },
        downloadCount: { lt: grant.downloadLimit },
      },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: now,
      },
    })

    if (updated.count === 0) {
      const latest = await tx.digitalDownloadGrant.findUnique({
        where: { id: grant.id },
        select: {
          revokedAt: true,
          expiresAt: true,
          downloadCount: true,
          downloadLimit: true,
        },
      })

      let deniedResult: Extract<DownloadAttemptResult, `DENIED_${string}`> = 'DENIED_OTHER'
      if (latest?.revokedAt) {
        deniedResult = 'DENIED_REVOKED'
      } else if (latest?.expiresAt && latest.expiresAt.getTime() <= now.getTime()) {
        deniedResult = 'DENIED_EXPIRED'
      } else if (
        latest &&
        Number.isFinite(latest.downloadLimit) &&
        Number.isFinite(latest.downloadCount) &&
        latest.downloadCount >= latest.downloadLimit
      ) {
        deniedResult = 'DENIED_EXHAUSTED'
      }

      await logDownloadEvent({
        tx,
        grantId: grant.id,
        result: deniedResult,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })

      return {
        ok: false as const,
        deniedResult,
      }
    }

    await logDownloadEvent({
      tx,
      grantId: grant.id,
      result: 'ALLOWED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })

    return {
      ok: true as const,
    }
  })

  if (!claimed.ok) {
    return {
      ok: false,
      result: claimed.deniedResult,
      grantId: grant.id,
    }
  }

  return {
    ok: true,
    result: 'ALLOWED',
    grantId: grant.id,
    file: {
      fileName: grant.digitalAsset.fileName,
      contentType: grant.digitalAsset.contentType,
      byteSize: grant.digitalAsset.byteSize,
      bytes: fileBytes,
    },
  }
}

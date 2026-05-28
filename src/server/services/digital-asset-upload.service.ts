import { Client as MinioClient } from 'minio'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_DIGITAL_ASSET_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

export const ALLOWED_DIGITAL_ASSET_CONTENT_TYPES = [
  'application/pdf',
  'application/zip',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const

export type AllowedDigitalAssetContentType = (typeof ALLOWED_DIGITAL_ASSET_CONTENT_TYPES)[number]

export class PrivateDigitalAssetStorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivateDigitalAssetStorageConfigError'
  }
}

type PrivateDigitalAssetStorageResult = {
  storageProvider: string
  storageKey: string
}

function sanitizeStorageScopeSegment(value: string, fallback = 'store') {
  const safe = (value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .trim()

  return (safe || fallback).slice(0, 120)
}

function normalizeUploadedContentType(contentType: string | null | undefined) {
  return (contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
}

function isMostlyTextBuffer(buffer: Buffer) {
  if (!buffer.length) {
    return false
  }

  let controlCount = 0
  for (const byte of buffer.values()) {
    if (byte === 0x00) {
      return false
    }
    const isWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e
    if (!isWhitespace && !isPrintableAscii) {
      controlCount += 1
    }
  }

  return controlCount / buffer.length < 0.05
}

export function detectDigitalAssetMimeType(buffer: Buffer): AllowedDigitalAssetContentType | null {
  if (!buffer.length) {
    return null
  }

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf'
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return 'application/zip'
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (isMostlyTextBuffer(buffer)) {
    return 'text/plain'
  }

  return null
}

function sanitizeFileNamePart(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeDigitalAssetFileName(fileName: string) {
  const safe = sanitizeFileNamePart(path.basename(fileName || 'file'))
  return safe.slice(0, 180) || 'file'
}

export function deriveDigitalAssetTitle(fileName: string, providedTitle?: string | null) {
  const safeTitle = sanitizeFileNamePart(providedTitle || '')
  if (safeTitle) {
    return safeTitle.slice(0, 160)
  }

  const safeFileName = sanitizeDigitalAssetFileName(fileName)
  const lastDot = safeFileName.lastIndexOf('.')
  const base = lastDot > 0 ? safeFileName.slice(0, lastDot) : safeFileName
  return base.slice(0, 160) || 'Digital file'
}

function buildSanitizedStorageFileName(fileName: string) {
  const safe = sanitizeDigitalAssetFileName(fileName).toLowerCase()
  return safe.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-')
}

type ResolvedPrivateStorageProvider = 's3' | 'local-private'

function resolvePrivateDigitalStorageProvider(): ResolvedPrivateStorageProvider {
  const provider = (process.env.MEDIA_STORAGE_PROVIDER || 'postgres').trim().toLowerCase()
  if (provider === 's3') {
    return 's3'
  }

  if (provider === 'vercel-blob' || provider === 'blob') {
    throw new PrivateDigitalAssetStorageConfigError(
      'Private digital uploads are not supported with MEDIA_STORAGE_PROVIDER=vercel-blob because blob objects are public.'
    )
  }

  return 'local-private'
}

function buildS3Client() {
  const region = process.env.MEDIA_S3_REGION?.trim()
  const bucket = process.env.MEDIA_S3_BUCKET?.trim()
  const accessKey = process.env.MEDIA_S3_ACCESS_KEY_ID?.trim()
  const secretKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY?.trim()
  const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim()

  if (!region || !bucket || !accessKey || !secretKey) {
    throw new PrivateDigitalAssetStorageConfigError(
      'S3 private digital upload requires MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.'
    )
  }

  if (!endpoint) {
    return {
      bucket,
      client: new MinioClient({
        endPoint: 's3.amazonaws.com',
        useSSL: true,
        region,
        accessKey,
        secretKey,
        pathStyle: false,
      }),
    }
  }

  const normalizedEndpoint = endpoint.includes('://') ? endpoint : `https://${endpoint}`
  const parsedEndpoint = new URL(normalizedEndpoint)

  return {
    bucket,
    client: new MinioClient({
      endPoint: parsedEndpoint.hostname,
      useSSL: parsedEndpoint.protocol === 'https:',
      port: parsedEndpoint.port ? Number(parsedEndpoint.port) : undefined,
      region,
      accessKey,
      secretKey,
      pathStyle: true,
    }),
  }
}

async function storePrivateDigitalFileInS3(params: {
  storeId: string
  fileName: string
  contentType: AllowedDigitalAssetContentType
  buffer: Buffer
}) {
  const { bucket, client } = buildS3Client()
  const safeStoreScope = sanitizeStorageScopeSegment(params.storeId, 'store')
  const storageFileName = buildSanitizedStorageFileName(params.fileName)
  const storageKey = `digital-private/${safeStoreScope}/${randomUUID()}-${storageFileName}`

  await client.putObject(bucket, storageKey, params.buffer, params.buffer.length, {
    'Content-Type': params.contentType,
    'Cache-Control': 'private, no-store',
  })

  return {
    storageProvider: 's3-private',
    storageKey,
  }
}

async function storePrivateDigitalFileInLocalDisk(params: {
  storeId: string
  fileName: string
  buffer: Buffer
}) {
  const baseDirectory =
    process.env.DIGITAL_ASSET_LOCAL_DIR?.trim() || path.join(process.cwd(), '.private-digital-assets')
  const resolvedBaseDirectory = path.resolve(baseDirectory)
  const safeStoreScope = sanitizeStorageScopeSegment(params.storeId, 'store')
  const storageFileName = buildSanitizedStorageFileName(params.fileName)
  const storageKey = `${safeStoreScope}/${randomUUID()}-${storageFileName}`
  const absoluteTargetPath = path.resolve(resolvedBaseDirectory, storageKey)
  const normalizedBasePath = `${resolvedBaseDirectory}${path.sep}`

  if (absoluteTargetPath !== resolvedBaseDirectory && !absoluteTargetPath.startsWith(normalizedBasePath)) {
    throw new PrivateDigitalAssetStorageConfigError('Invalid private digital asset storage path target.')
  }

  await mkdir(path.dirname(absoluteTargetPath), { recursive: true, mode: 0o700 })
  await writeFile(absoluteTargetPath, params.buffer, { mode: 0o600 })

  return {
    storageProvider: 'local-private',
    storageKey,
  }
}

export async function storePrivateDigitalAssetFile(params: {
  storeId: string
  fileName: string
  contentType: AllowedDigitalAssetContentType
  buffer: Buffer
}): Promise<PrivateDigitalAssetStorageResult> {
  const resolvedProvider = resolvePrivateDigitalStorageProvider()

  if (resolvedProvider === 's3') {
    return storePrivateDigitalFileInS3(params)
  }

  return storePrivateDigitalFileInLocalDisk(params)
}

export function hashDigitalAssetBufferSha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function isAllowedDigitalAssetContentType(contentType: string) {
  return ALLOWED_DIGITAL_ASSET_CONTENT_TYPES.includes(
    normalizeUploadedContentType(contentType) as AllowedDigitalAssetContentType
  )
}

export function resolveValidatedDigitalAssetContentType(
  buffer: Buffer,
  uploadedContentType: string | null | undefined
) {
  const detected = detectDigitalAssetMimeType(buffer)
  if (!detected) {
    return {
      ok: false as const,
      error: 'Unsupported file type. Allowed: PDF, ZIP, PNG, JPEG, TXT.',
    }
  }

  const normalizedUploadedContentType = normalizeUploadedContentType(uploadedContentType)
  if (normalizedUploadedContentType && normalizedUploadedContentType !== detected) {
    return {
      ok: false as const,
      error: 'Uploaded file type does not match file contents.',
    }
  }

  return {
    ok: true as const,
    contentType: detected,
  }
}

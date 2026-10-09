#!/usr/bin/env node

import crypto from 'node:crypto'
import process from 'node:process'

import dotenv from 'dotenv'
import { parseEnvironmentSubset, storageEnvironmentSchema } from '../src/lib/env-schema.ts'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { createS3Client } from '../src/server/media/s3-client-factory.ts'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ path: '.env', quiet: true })

const args = new Set(process.argv.slice(2))
const argValues = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const [key, ...valueParts] = arg.slice(2).split('=')
      return [key, valueParts.join('=')]
    })
)

const isDryRun = args.has('--dry-run')
const clearData = args.has('--clear-data')
const limit = Math.max(1, Math.min(500, Number(argValues.get('limit') || 50)))
let environment

function usage() {
  console.log(`Usage:
  node scripts/migrate-media-to-object-storage.mjs --dry-run
  node scripts/migrate-media-to-object-storage.mjs --limit=100
  node scripts/migrate-media-to-object-storage.mjs --limit=100 --clear-data

Required env for writes:
  MEDIA_STORAGE_PROVIDER=s3
  MEDIA_S3_REGION=auto
  MEDIA_S3_BUCKET=your-bucket
  MEDIA_S3_ACCESS_KEY_ID=...
  MEDIA_S3_SECRET_ACCESS_KEY=...
  MEDIA_S3_ENDPOINT=https://accountid.r2.cloudflarestorage.com optional
  MEDIA_PUBLIC_BASE_URL=https://cdn.example.com optional

Notes:
  --dry-run prints eligible rows and exits without uploading.
  --clear-data nulls MediaAsset.data only after each object upload and metadata update succeeds.
`)
}

function requiredEnv(name) {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizePgConnectionString(connectionString) {
  try {
    const url = new URL(connectionString)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode && ['prefer', 'require', 'verify-ca'].includes(sslmode)) {
      url.searchParams.set('sslmode', 'verify-full')
      return url.toString()
    }
  } catch {
    // Keep original if parsing fails.
  }
  return connectionString
}

function trimSlash(value) {
  return value.replace(/\/+$/, '')
}

function sanitizeFilename(filename) {
  const dotIndex = filename.lastIndexOf('.')
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1) : ''

  const safeBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '')

  return safeExt ? `${safeBase || 'asset'}.${safeExt}` : safeBase || 'asset'
}

function buildStorageKey(assetId, filename) {
  return `media/${assetId}/${sanitizeFilename(filename)}`
}

function buildPublicUrl(publicBaseUrl, key) {
  if (!publicBaseUrl) return null
  const base = trimSlash(publicBaseUrl)
  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  return `${base}/${encodedKey}`
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    usage()
    return
  }

  environment = parseEnvironmentSubset(storageEnvironmentSchema, process.env)
  const databaseUrl = requiredEnv('DATABASE_URL')
  const adapter = new PrismaPg({ connectionString: normalizePgConnectionString(databaseUrl) })
  const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

  try {
    const assets = await prisma.mediaAsset.findMany({
      where: {
        storageProvider: 'postgres',
        data: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        data: true,
      },
    })

    console.log(`[media-migrate] Found ${assets.length} eligible Postgres-backed asset(s).`)

    if (isDryRun) {
      for (const asset of assets) {
        console.log(`[media-migrate] dry-run asset=${asset.id} filename="${asset.filename}" size=${asset.size ?? asset.data?.length ?? 0}`)
      }
      return
    }

    if (environment.MEDIA_STORAGE_PROVIDER !== 's3') {
      throw new Error('MEDIA_STORAGE_PROVIDER=s3 is required for object-storage migration writes')
    }

    const config = {
      endpoint: environment.MEDIA_S3_ENDPOINT,
      region: requiredEnv('MEDIA_S3_REGION'),
      bucket: requiredEnv('MEDIA_S3_BUCKET'),
      accessKeyId: requiredEnv('MEDIA_S3_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('MEDIA_S3_SECRET_ACCESS_KEY'),
      publicBaseUrl: environment.MEDIA_PUBLIC_BASE_URL,
    }
    const objectClient = createS3Client(config)

    let migrated = 0
    let failed = 0

    for (const asset of assets) {
      if (!asset.data) continue

      const buffer = Buffer.from(asset.data)
      const key = buildStorageKey(asset.id, asset.filename)
      const publicUrl = buildPublicUrl(config.publicBaseUrl, key)
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex')

      try {
        await objectClient.putObject(config.bucket, key, buffer, buffer.length, {
          'Content-Type': asset.mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'x-amz-meta-asset-id': asset.id,
          'x-amz-meta-filename': asset.filename,
          'x-amz-meta-sha256': checksum,
        })

        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            storageProvider: 's3',
            storageKey: key,
            storageBucket: config.bucket,
            publicUrl,
            ...(clearData ? { data: null } : {}),
          },
        })

        migrated += 1
        console.log(`[media-migrate] migrated asset=${asset.id} key=${key} clearData=${clearData}`)
      } catch (error) {
        failed += 1
        console.error(`[media-migrate] failed asset=${asset.id}`, error)
      }
    }

    console.log(`[media-migrate] complete migrated=${migrated} failed=${failed} scanned=${assets.length}`)
    if (failed > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('[media-migrate] fatal', error)
  process.exit(1)
})

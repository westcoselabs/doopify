import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    digitalDownloadGrant: {
      findUnique: vi.fn(),
    },
    digitalDownloadEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    digitalDownloadGrant: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    digitalDownloadEvent: {
      create: vi.fn(),
    },
  },
  minioCtor: vi.fn(),
  s3GetObject: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('minio', () => ({
  Client: vi.fn().mockImplementation(function (...args: unknown[]) {
    mocks.minioCtor(...args)
    return {
      getObject: mocks.s3GetObject,
    }
  }),
}))

import { resolveDigitalDownloadByToken } from './digital-download-access.service'

function grantFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant_1',
    tokenHash: 'hash_1',
    downloadLimit: 2,
    downloadCount: 0,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    revokedAt: null,
    digitalAsset: {
      id: 'asset_1',
      fileName: 'Guide.pdf',
      contentType: 'application/pdf',
      byteSize: 12,
      storageProvider: 'local-private',
      storageKey: 'store_1/guide.pdf',
    },
    ...overrides,
  }
}

describe('digital-download-access.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx))
    mocks.tx.digitalDownloadGrant.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.digitalDownloadGrant.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      downloadCount: 0,
      downloadLimit: 2,
    })
  })

  it('downloads valid grants and increments usage while logging ALLOWED event', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'doopify-digital-access-'))
    const storageKey = 'store_1/subdir/guide.pdf'
    const absolutePath = path.resolve(root, ...storageKey.split('/'))
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, Buffer.from('%PDF-1.7 mock', 'utf8'))

    const previousLocalDir = process.env.DIGITAL_ASSET_LOCAL_DIR
    process.env.DIGITAL_ASSET_LOCAL_DIR = root

    try {
      mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
        grantFixture({
          digitalAsset: {
            ...grantFixture().digitalAsset,
            storageKey,
          },
        })
      )

      const result = await resolveDigitalDownloadByToken({
        token: 'raw-download-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.result).toBe('ALLOWED')
      expect(result.file.fileName).toBe('Guide.pdf')
      expect(result.file.contentType).toBe('application/pdf')
      expect(result.file.bytes.length).toBeGreaterThan(0)
      expect(result.file.bytes.toString('utf8')).toContain('%PDF-1.7')
      expect(mocks.tx.digitalDownloadGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            downloadCount: { increment: 1 },
          }),
        })
      )
      expect(mocks.tx.digitalDownloadEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grantId: 'grant_1',
            result: 'ALLOWED',
          }),
        })
      )
      expect(mocks.prisma.digitalDownloadEvent.create).not.toHaveBeenCalled()
    } finally {
      if (previousLocalDir == null) {
        delete process.env.DIGITAL_ASSET_LOCAL_DIR
      } else {
        process.env.DIGITAL_ASSET_LOCAL_DIR = previousLocalDir
      }
    }
  })

  it('denies expired grants and logs DENIED_EXPIRED', async () => {
    mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
      grantFixture({
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      })
    )

    const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

    expect(result).toMatchObject({
      ok: false,
      result: 'DENIED_EXPIRED',
      grantId: 'grant_1',
    })
    expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grantId: 'grant_1',
          result: 'DENIED_EXPIRED',
        }),
      })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('denies revoked grants and logs DENIED_REVOKED', async () => {
    mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
      grantFixture({
        revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    )

    const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

    expect(result).toMatchObject({
      ok: false,
      result: 'DENIED_REVOKED',
      grantId: 'grant_1',
    })
    expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grantId: 'grant_1',
          result: 'DENIED_REVOKED',
        }),
      })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('denies exhausted grants and logs DENIED_EXHAUSTED', async () => {
    mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
      grantFixture({
        downloadLimit: 1,
        downloadCount: 1,
      })
    )

    const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

    expect(result).toMatchObject({
      ok: false,
      result: 'DENIED_EXHAUSTED',
      grantId: 'grant_1',
    })
    expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grantId: 'grant_1',
          result: 'DENIED_EXHAUSTED',
        }),
      })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('denies invalid tokens safely', async () => {
    const result = await resolveDigitalDownloadByToken({ token: '  ' })

    expect(result).toEqual({
      ok: false,
      result: 'INVALID_TOKEN',
    })
    expect(mocks.prisma.digitalDownloadGrant.findUnique).not.toHaveBeenCalled()
  })

  it('denies missing assets safely and logs DENIED_OTHER', async () => {
    mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
      grantFixture({
        digitalAsset: null,
      })
    )

    const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

    expect(result).toMatchObject({
      ok: false,
      result: 'DENIED_OTHER',
      grantId: 'grant_1',
    })
    expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grantId: 'grant_1',
          result: 'DENIED_OTHER',
        }),
      })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('denies when local storage key attempts path traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'doopify-digital-access-'))
    const previousLocalDir = process.env.DIGITAL_ASSET_LOCAL_DIR
    process.env.DIGITAL_ASSET_LOCAL_DIR = root

    try {
      mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
        grantFixture({
          digitalAsset: {
            ...grantFixture().digitalAsset,
            storageKey: '../outside.pdf',
          },
        })
      )

      const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

      expect(result).toMatchObject({
        ok: false,
        result: 'DENIED_OTHER',
      })
      expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'DENIED_OTHER',
          }),
        })
      )
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      if (previousLocalDir == null) {
        delete process.env.DIGITAL_ASSET_LOCAL_DIR
      } else {
        process.env.DIGITAL_ASSET_LOCAL_DIR = previousLocalDir
      }
    }
  })

  it('denies safely when storage file is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'doopify-digital-access-'))
    const previousLocalDir = process.env.DIGITAL_ASSET_LOCAL_DIR
    process.env.DIGITAL_ASSET_LOCAL_DIR = root

    try {
      mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
        grantFixture({
          digitalAsset: {
            ...grantFixture().digitalAsset,
            storageKey: 'store_1/not-found.pdf',
          },
        })
      )

      const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

      expect(result).toMatchObject({
        ok: false,
        result: 'DENIED_OTHER',
      })
      expect(mocks.prisma.digitalDownloadEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'DENIED_OTHER',
          }),
        })
      )
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    } finally {
      if (previousLocalDir == null) {
        delete process.env.DIGITAL_ASSET_LOCAL_DIR
      } else {
        process.env.DIGITAL_ASSET_LOCAL_DIR = previousLocalDir
      }
    }
  })

  it('supports s3-private reads through configured private object access', async () => {
    const previousRegion = process.env.MEDIA_S3_REGION
    const previousBucket = process.env.MEDIA_S3_BUCKET
    const previousAccessKey = process.env.MEDIA_S3_ACCESS_KEY_ID
    const previousSecret = process.env.MEDIA_S3_SECRET_ACCESS_KEY
    const previousEndpoint = process.env.MEDIA_S3_ENDPOINT

    process.env.MEDIA_S3_REGION = 'us-east-1'
    process.env.MEDIA_S3_BUCKET = 'bucket'
    process.env.MEDIA_S3_ACCESS_KEY_ID = 'key'
    process.env.MEDIA_S3_SECRET_ACCESS_KEY = 'secret'
    process.env.MEDIA_S3_ENDPOINT = 'https://s3.example.com'

    try {
      mocks.s3GetObject.mockResolvedValue(Readable.from([Buffer.from('s3-bytes', 'utf8')]))
      mocks.prisma.digitalDownloadGrant.findUnique.mockResolvedValue(
        grantFixture({
          digitalAsset: {
            ...grantFixture().digitalAsset,
            storageProvider: 's3-private',
            storageKey: 'digital-private/store_1/file.pdf',
          },
        })
      )

      const result = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.file.bytes.toString('utf8')).toBe('s3-bytes')
      expect(mocks.s3GetObject).toHaveBeenCalledWith('bucket', 'digital-private/store_1/file.pdf')
    } finally {
      if (previousRegion == null) delete process.env.MEDIA_S3_REGION
      else process.env.MEDIA_S3_REGION = previousRegion
      if (previousBucket == null) delete process.env.MEDIA_S3_BUCKET
      else process.env.MEDIA_S3_BUCKET = previousBucket
      if (previousAccessKey == null) delete process.env.MEDIA_S3_ACCESS_KEY_ID
      else process.env.MEDIA_S3_ACCESS_KEY_ID = previousAccessKey
      if (previousSecret == null) delete process.env.MEDIA_S3_SECRET_ACCESS_KEY
      else process.env.MEDIA_S3_SECRET_ACCESS_KEY = previousSecret
      if (previousEndpoint == null) delete process.env.MEDIA_S3_ENDPOINT
      else process.env.MEDIA_S3_ENDPOINT = previousEndpoint
    }
  })

  it('stops repeated successful downloads at the configured limit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'doopify-digital-access-'))
    const storageKey = 'store_1/limit.pdf'
    const absolutePath = path.resolve(root, ...storageKey.split('/'))
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, Buffer.from('%PDF-1.7 limit', 'utf8'))

    const previousLocalDir = process.env.DIGITAL_ASSET_LOCAL_DIR
    process.env.DIGITAL_ASSET_LOCAL_DIR = root

    try {
      mocks.prisma.digitalDownloadGrant.findUnique
        .mockResolvedValueOnce(
          grantFixture({
            downloadLimit: 1,
            downloadCount: 0,
            digitalAsset: {
              ...grantFixture().digitalAsset,
              storageKey,
            },
          })
        )
        .mockResolvedValueOnce(
          grantFixture({
            downloadLimit: 1,
            downloadCount: 1,
            digitalAsset: {
              ...grantFixture().digitalAsset,
              storageKey,
            },
          })
        )

      const first = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })
      const second = await resolveDigitalDownloadByToken({ token: 'raw-download-token' })

      expect(first.ok).toBe(true)
      expect(second).toMatchObject({
        ok: false,
        result: 'DENIED_EXHAUSTED',
      })
    } finally {
      if (previousLocalDir == null) {
        delete process.env.DIGITAL_ASSET_LOCAL_DIR
      } else {
        process.env.DIGITAL_ASSET_LOCAL_DIR = previousLocalDir
      }
    }
  })
})

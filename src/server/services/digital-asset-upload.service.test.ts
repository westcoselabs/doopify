import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  deriveDigitalAssetTitle,
  detectDigitalAssetMimeType,
  hashDigitalAssetBufferSha256,
  resolveValidatedDigitalAssetContentType,
  sanitizeDigitalAssetFileName,
  storePrivateDigitalAssetFile,
} from './digital-asset-upload.service'

describe('digital-asset-upload.service', () => {
  it('detects supported binary mime signatures', () => {
    const pdf = Buffer.from('%PDF-1.7 mock', 'utf8')
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02])
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

    expect(detectDigitalAssetMimeType(pdf)).toBe('application/pdf')
    expect(detectDigitalAssetMimeType(zip)).toBe('application/zip')
    expect(detectDigitalAssetMimeType(png)).toBe('image/png')
    expect(detectDigitalAssetMimeType(jpeg)).toBe('image/jpeg')
  })

  it('treats plain text payload as text/plain', () => {
    const text = Buffer.from('hello doopify digital file', 'utf8')
    expect(detectDigitalAssetMimeType(text)).toBe('text/plain')
  })

  it('rejects mismatched uploaded content type', () => {
    const pdf = Buffer.from('%PDF-1.7 mock', 'utf8')
    const validation = resolveValidatedDigitalAssetContentType(pdf, 'text/plain')
    expect(validation.ok).toBe(false)
  })

  it('sanitizes display file name and derives fallback title', () => {
    const fileName = sanitizeDigitalAssetFileName(' ..\\My\nSecret\tBook.pdf ')
    const title = deriveDigitalAssetTitle(fileName)

    expect(fileName).toContain('MySecretBook.pdf')
    expect(title).toBe('MySecretBook')
  })

  it('hashes file bytes with sha256', () => {
    const hash = hashDigitalAssetBufferSha256(Buffer.from('abc', 'utf8'))
    expect(hash).toHaveLength(64)
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('keeps local private storage writes contained to configured base directory', async () => {
    const previousProvider = process.env.MEDIA_STORAGE_PROVIDER
    const previousLocalDir = process.env.DIGITAL_ASSET_LOCAL_DIR
    const privateRoot = await mkdtemp(path.join(tmpdir(), 'doopify-digital-private-'))

    process.env.MEDIA_STORAGE_PROVIDER = 'postgres'
    process.env.DIGITAL_ASSET_LOCAL_DIR = privateRoot

    try {
      const stored = await storePrivateDigitalAssetFile({
        storeId: '../unsafe\\scope',
        fileName: '../my-guide.pdf',
        contentType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7 local', 'utf8'),
      })

      expect(stored.storageProvider).toBe('local-private')
      expect(stored.storageKey).not.toContain('..')

      const storedFilePath = path.resolve(privateRoot, ...stored.storageKey.split('/'))
      expect(storedFilePath.startsWith(path.resolve(privateRoot))).toBe(true)

      const savedBytes = await readFile(storedFilePath)
      expect(savedBytes.length).toBeGreaterThan(0)
    } finally {
      if (previousProvider == null) {
        delete process.env.MEDIA_STORAGE_PROVIDER
      } else {
        process.env.MEDIA_STORAGE_PROVIDER = previousProvider
      }

      if (previousLocalDir == null) {
        delete process.env.DIGITAL_ASSET_LOCAL_DIR
      } else {
        process.env.DIGITAL_ASSET_LOCAL_DIR = previousLocalDir
      }
    }
  })

  it('rejects vercel blob provider for private digital uploads', async () => {
    const previousProvider = process.env.MEDIA_STORAGE_PROVIDER

    process.env.MEDIA_STORAGE_PROVIDER = 'vercel-blob'

    try {
      await expect(
        storePrivateDigitalAssetFile({
          storeId: 'store_1',
          fileName: 'guide.pdf',
          contentType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7 local', 'utf8'),
        })
      ).rejects.toThrow(
        'Private digital uploads are not supported with MEDIA_STORAGE_PROVIDER=vercel-blob because blob objects are public.'
      )
    } finally {
      if (previousProvider == null) {
        delete process.env.MEDIA_STORAGE_PROVIDER
      } else {
        process.env.MEDIA_STORAGE_PROVIDER = previousProvider
      }
    }
  })
})

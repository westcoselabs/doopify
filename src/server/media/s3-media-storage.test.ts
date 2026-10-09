import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildS3MediaStorageKey, createS3MediaStorageAdapter } from './s3-media-storage'

function buildDeps(overrides?: {
  putObject?: ReturnType<typeof vi.fn>
  getObject?: ReturnType<typeof vi.fn>
  removeObject?: ReturnType<typeof vi.fn>
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  findUnique?: ReturnType<typeof vi.fn>
  deleteRecord?: ReturnType<typeof vi.fn>
}) {
  const putObject = overrides?.putObject || vi.fn().mockResolvedValue({})
  const getObject = overrides?.getObject || vi.fn().mockResolvedValue(Buffer.from('binary'))
  const removeObject = overrides?.removeObject || vi.fn().mockResolvedValue(undefined)

  const create =
    overrides?.create ||
    vi.fn().mockResolvedValue({
      id: 'asset_123',
      filename: 'Hero Banner.PNG',
      altText: 'Hero banner',
      mimeType: 'image/png',
      size: 6,
      createdAt: new Date('2026-05-02T12:00:00.000Z'),
    })

  const update =
    overrides?.update ||
    vi.fn().mockResolvedValue({
      id: 'asset_123',
      filename: 'Hero Banner.PNG',
      altText: 'Hero banner',
      mimeType: 'image/png',
      size: 6,
      createdAt: new Date('2026-05-02T12:00:00.000Z'),
    })

  const findUnique =
    overrides?.findUnique ||
    vi.fn().mockResolvedValue({
      id: 'asset_123',
      filename: 'Hero Banner.PNG',
      mimeType: 'image/png',
      size: 6,
      storageProvider: 's3',
      storageKey: 'media/asset_123/hero-banner.png',
      storageBucket: 'doopify-media',
      publicUrl: null,
    })

  const deleteRecord = overrides?.deleteRecord || vi.fn().mockResolvedValue({ id: 'asset_123' })

  return {
    putObject,
    getObject,
    removeObject,
    create,
    update,
    findUnique,
    deleteRecord,
    deps: {
      objectClient: {
        putObject,
        getObject,
        removeObject,
      },
      prismaClient: {
        mediaAsset: {
          create,
          update,
          findUnique,
          delete: deleteRecord,
        },
      },
    },
  }
}

describe('s3 media storage adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates deterministic sanitized object keys', () => {
    expect(buildS3MediaStorageKey('asset_123', 'Hero Banner.PNG')).toBe('media/asset_123/hero-banner.png')
    expect(buildS3MediaStorageKey('asset_123', '__Weird File Name!!.webp')).toBe('media/asset_123/weird-file-name.webp')
  })

  it('uploads through s3 and persists storage metadata', async () => {
    const mock = buildDeps()
    const adapter = createS3MediaStorageAdapter(
      {
        endpoint: 'https://example-s3.test',
        region: 'auto',
        bucket: 'doopify-media',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      mock.deps as any
    )

    const result = await adapter.put({
      filename: 'Hero Banner.PNG',
      altText: 'Hero banner',
      mimeType: 'image/png',
      size: 6,
      buffer: Buffer.from('binary'),
      productId: 'prod_1',
    })

    expect(mock.putObject).toHaveBeenCalledTimes(1)
    expect(mock.putObject).toHaveBeenCalledWith(
      'doopify-media',
      'media/asset_123/hero-banner.png',
      expect.any(Buffer),
      6,
      expect.objectContaining({
        'Content-Type': 'image/png',
      })
    )

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset_123' },
        data: expect.objectContaining({
          storageKey: 'media/asset_123/hero-banner.png',
          storageBucket: 'doopify-media',
        }),
      })
    )

    expect(result).toMatchObject({
      id: 'asset_123',
      provider: 's3',
      url: '/api/media/asset_123',
      linkedProducts: 1,
    })
  })

  it('does not delete db metadata when object delete fails', async () => {
    const removeObject = vi.fn().mockRejectedValue(new Error('s3 unavailable'))
    const mock = buildDeps({ removeObject })

    const adapter = createS3MediaStorageAdapter(
      {
        endpoint: 'https://example-s3.test',
        region: 'auto',
        bucket: 'doopify-media',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      mock.deps as any
    )

    await expect(adapter.delete('asset_123')).rejects.toThrow('s3 unavailable')
    expect(mock.removeObject).toHaveBeenCalledWith('doopify-media', 'media/asset_123/hero-banner.png')
    expect(mock.deleteRecord).not.toHaveBeenCalled()
  })

  it('cleans up metadata when s3 upload fails after row creation', async () => {
    const putObject = vi.fn().mockRejectedValue(new Error('upload failed'))
    const mock = buildDeps({ putObject })
    const adapter = createS3MediaStorageAdapter(
      {
        endpoint: 'https://example-s3.test',
        region: 'auto',
        bucket: 'doopify-media',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      mock.deps as any
    )

    await expect(
      adapter.put({
        filename: 'Hero Banner.PNG',
        mimeType: 'image/png',
        size: 6,
        buffer: Buffer.from('binary'),
      })
    ).rejects.toThrow('upload failed')

    expect(mock.deleteRecord).toHaveBeenCalledWith({ where: { id: 'asset_123' } })
  })

  it('deletes from s3 and removes db metadata on success', async () => {
    const removeObject = vi.fn().mockResolvedValue(undefined)
    const deleteRecord = vi.fn().mockResolvedValue({ id: 'asset_123' })
    const mock = buildDeps({ removeObject, deleteRecord })

    const adapter = createS3MediaStorageAdapter(
      {
        endpoint: 'https://example-s3.test',
        region: 'auto',
        bucket: 'doopify-media',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      mock.deps as any
    )

    await adapter.delete('asset_123')

    expect(mock.removeObject).toHaveBeenCalledWith('doopify-media', 'media/asset_123/hero-banner.png')
    expect(mock.deleteRecord).toHaveBeenCalledWith({ where: { id: 'asset_123' } })
  })

  it('returns a redirect read when a public URL is recorded', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'asset_123',
      filename: 'Hero Banner.PNG',
      mimeType: 'image/png',
      size: 6,
      storageProvider: 's3',
      storageKey: 'media/asset_123/hero-banner.png',
      storageBucket: 'doopify-media',
      publicUrl: 'https://cdn.example.com/media/asset_123/hero-banner.png',
    })
    const mock = buildDeps({ findUnique })
    const adapter = createS3MediaStorageAdapter(
      {
        endpoint: 'https://example-s3.test',
        region: 'auto',
        bucket: 'doopify-media',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      mock.deps as any
    )

    const result = await adapter.get('asset_123')

    expect(result).toMatchObject({
      redirectUrl: 'https://cdn.example.com/media/asset_123/hero-banner.png',
      filename: 'Hero Banner.PNG',
    })
    expect(mock.getObject).not.toHaveBeenCalled()
  })
})

it('streams private objects incrementally and releases the source on cancellation', async () => {
  const body = new PassThrough();
  const mock = buildDeps({ getObject: vi.fn().mockResolvedValue(body) });
  const adapter = createS3MediaStorageAdapter({ endpoint: 'https://example.test', bucket: 'media', accessKeyId: 'inert', secretAccessKey: 'inert', region: 'auto' }, mock.deps as any);
  const result = await adapter.get('asset_123');
  expect(result?.body).toBeUndefined();
  const reader = result!.stream!.getReader();
  body.write(Buffer.from('first chunk'));
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('first chunk');
  await reader.cancel();
  expect(body.destroyed).toBe(true);
});

it('propagates request cancellation to the object source', async () => {
  const body = new PassThrough();
  const mock = buildDeps({ getObject: vi.fn().mockResolvedValue(body) });
  const adapter = createS3MediaStorageAdapter({ endpoint: 'https://example.test', bucket: 'media', accessKeyId: 'inert', secretAccessKey: 'inert', region: 'auto' }, mock.deps as any);
  const abort = new AbortController();
  const result = await adapter.get('asset_123', abort.signal);
  const reader = result!.stream!.getReader();
  const pending = reader.read();
  abort.abort();
  await expect(pending).rejects.toThrow('Media request cancelled');
  expect(body.destroyed).toBe(true);
});

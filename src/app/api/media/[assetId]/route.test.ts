import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  deleteAsset: vi.fn(),
  getAsset: vi.fn(),
  getMediaAssetById: vi.fn(),
  getStore: vi.fn(),
  getMediaStorageAdapterForProvider: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: {
      findUnique: mocks.getMediaAssetById,
    },
    store: {
      findFirst: mocks.getStore,
    },
  },
}))

vi.mock('@/server/media/media-storage', () => ({
  MediaStorageConfigError: class MediaStorageConfigError extends Error {
    provider: string
    constructor(provider: string, message: string) {
      super(message)
      this.provider = provider
    }
  },
  getMediaStorageAdapter: () => ({
    provider: 'postgres',
    put: vi.fn(),
    get: mocks.getAsset,
    delete: mocks.deleteAsset,
    getPublicUrl: (assetId: string) => `/api/media/${assetId}`,
  }),
  getMediaStorageAdapterForProvider: mocks.getMediaStorageAdapterForProvider,
  getMediaPublicUrl: (assetId: string) => `/api/media/${assetId}`,
}))

import { DELETE, GET } from './route'
import { MediaStorageConfigError } from '@/server/media/media-storage'

describe('GET /api/media/[assetId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAsset.mockResolvedValue({
      redirectUrl: 'https://blob.vercel-storage.com/media/asset_1/image.png',
      mimeType: 'image/png',
      filename: 'image.png',
      size: 1024,
      cacheControl: 'public, max-age=31536000, immutable',
    })
  })

  it('redirects to publicUrl for object-stored assets', async () => {
    const response = await GET(new Request('http://localhost/api/media/asset_1'), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://blob.vercel-storage.com/media/asset_1/image.png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })
})

describe('DELETE /api/media/[assetId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'admin_1', email: 'admin@example.com', role: 'OWNER' },
    })
    mocks.getMediaAssetById.mockResolvedValue({
      id: 'asset_1',
      storageProvider: 'postgres',
    })
    mocks.getStore.mockResolvedValue({
      id: 'store_1',
      logoUrl: null,
      faviconUrl: null,
      emailLogoUrl: null,
      checkoutLogoUrl: null,
    })
    mocks.getMediaStorageAdapterForProvider.mockReturnValue({
      delete: mocks.deleteAsset,
    })
    mocks.deleteAsset.mockResolvedValue(undefined)
  })

  it('resolves delete adapter by the asset storage provider and deletes the asset', async () => {
    const response = await DELETE(new Request('http://localhost/api/media/asset_1', { method: 'DELETE' }), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })

    expect(response.status).toBe(204)
    expect(mocks.getMediaStorageAdapterForProvider).toHaveBeenCalledWith('postgres')
    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset_1')
  })

  it('returns a safe not-found response when the asset does not exist', async () => {
    mocks.getMediaAssetById.mockResolvedValue(null)

    const response = await DELETE(new Request('http://localhost/api/media/asset_1', { method: 'DELETE' }), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json).toMatchObject({
      success: false,
      error: 'Asset not found',
    })
    expect(mocks.deleteAsset).not.toHaveBeenCalled()
  })

  it('blocks deleting an asset referenced by store branding', async () => {
    mocks.getStore.mockResolvedValue({
      id: 'store_1',
      logoUrl: '/api/media/asset_1',
      faviconUrl: null,
      emailLogoUrl: null,
      checkoutLogoUrl: null,
    })

    const response = await DELETE(new Request('http://localhost/api/media/asset_1', { method: 'DELETE' }), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toMatchObject({
      success: false,
      error: 'This image is currently used in store branding. Update branding first, then delete it.',
    })
    expect(mocks.deleteAsset).not.toHaveBeenCalled()
  })

  it('returns a safe configuration error when asset storage is not configured', async () => {
    mocks.getMediaStorageAdapterForProvider.mockImplementation(() => {
      throw new MediaStorageConfigError('s3', 'missing credentials')
    })

    const response = await DELETE(new Request('http://localhost/api/media/asset_1', { method: 'DELETE' }), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({
      success: false,
      error: 'Media storage is not configured for this asset.',
    })
  })

  it('returns a safe failure response when storage delete fails', async () => {
    mocks.deleteAsset.mockRejectedValue(new Error('delete failed'))

    const response = await DELETE(new Request('http://localhost/api/media/asset_1', { method: 'DELETE' }), {
      params: Promise.resolve({ assetId: 'asset_1' }),
    })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({
      success: false,
      error: 'Failed to delete asset',
    })
  })
})

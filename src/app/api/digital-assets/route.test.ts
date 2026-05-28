import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminOrAbove: vi.fn(),
  getStoreSettingsLite: vi.fn(),
  listDigitalAssetsForStore: vi.fn(),
  createDigitalAssetMetadata: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdminOrAbove: mocks.requireAdminOrAbove,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

vi.mock('@/server/services/digital-asset.service', async () => {
  const actual = await vi.importActual('@/server/services/digital-asset.service')
  return {
    ...actual,
    listDigitalAssetsForStore: mocks.listDigitalAssetsForStore,
    createDigitalAssetMetadata: mocks.createDigitalAssetMetadata,
  }
})

import { GET, POST } from './route'

describe('api/digital-assets route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStoreSettingsLite.mockResolvedValue({ id: 'store_1' })
  })

  it('rejects unauthenticated requests', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/digital-assets'))
    expect(response.status).toBe(401)
    expect(mocks.listDigitalAssetsForStore).not.toHaveBeenCalled()
  })

  it('rejects STAFF/non-owner-admin requests', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/digital-assets'))
    expect(response.status).toBe(403)
  })

  it('allows owner/admin and does not expose storageKey in list payload', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.listDigitalAssetsForStore.mockResolvedValue([
      {
        id: 'asset_1',
        title: 'Ebook',
        fileName: 'ebook.pdf',
        contentType: 'application/pdf',
        byteSize: 1024,
        storageProvider: 's3',
        checksumSha256: null,
      },
    ])

    const response = await GET(new Request('http://localhost/api/digital-assets'))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })

  it('creates metadata for owner/admin without exposing storageKey in response', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'ADMIN' },
    })
    mocks.createDigitalAssetMetadata.mockResolvedValue({
      id: 'asset_1',
      storeId: 'store_1',
      title: 'Ebook',
      fileName: 'ebook.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
      storageProvider: 's3',
      checksumSha256: null,
      createdAt: new Date('2026-05-28T00:00:00.000Z'),
      updatedAt: new Date('2026-05-28T00:00:00.000Z'),
    })

    const response = await POST(
      new Request('http://localhost/api/digital-assets', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Ebook',
          fileName: 'ebook.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          storageProvider: 's3',
          storageKey: 'private/ebook.pdf',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.createDigitalAssetMetadata).toHaveBeenCalledWith(
      'store_1',
      expect.objectContaining({ storageKey: 'private/ebook.pdf' })
    )

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })
})

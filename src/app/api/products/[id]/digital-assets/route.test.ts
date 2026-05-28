import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminOrAbove: vi.fn(),
  getStoreSettingsLite: vi.fn(),
  listProductDigitalAssets: vi.fn(),
  linkDigitalAssetToProduct: vi.fn(),
  unlinkDigitalAssetFromProduct: vi.fn(),
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
    listProductDigitalAssets: mocks.listProductDigitalAssets,
    linkDigitalAssetToProduct: mocks.linkDigitalAssetToProduct,
    unlinkDigitalAssetFromProduct: mocks.unlinkDigitalAssetFromProduct,
  }
})

import { DELETE, GET, POST } from './route'

const params = { params: Promise.resolve({ id: 'prod_1' }) }

describe('api/products/[id]/digital-assets route', () => {
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

    const response = await GET(new Request('http://localhost/api/products/prod_1/digital-assets'), params)
    expect(response.status).toBe(401)
    expect(mocks.listProductDigitalAssets).not.toHaveBeenCalled()
  })

  it('returns product asset list for owner/admin without exposing storageKey', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'ADMIN' },
    })
    mocks.listProductDigitalAssets.mockResolvedValue([
      {
        id: 'pda_1',
        sortOrder: 0,
        digitalAsset: {
          id: 'asset_1',
          title: 'Ebook',
          fileName: 'ebook.pdf',
          storageProvider: 's3',
        },
      },
    ])

    const response = await GET(new Request('http://localhost/api/products/prod_1/digital-assets'), params)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })

  it('blocks cross-store link attempts', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.linkDigitalAssetToProduct.mockRejectedValue(new Error('Digital asset not found for store'))

    const response = await POST(
      new Request('http://localhost/api/products/prod_1/digital-assets', {
        method: 'POST',
        body: JSON.stringify({ digitalAssetId: 'asset_other_store' }),
      }),
      params
    )

    expect(response.status).toBe(404)
    const payload = await response.json()
    expect(payload).toMatchObject({
      success: false,
      error: 'Digital asset not found for store',
    })
  })

  it('unlinks digital asset without deleting metadata', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })
    mocks.unlinkDigitalAssetFromProduct.mockResolvedValue({ removed: true })

    const response = await DELETE(
      new Request('http://localhost/api/products/prod_1/digital-assets', {
        method: 'DELETE',
        body: JSON.stringify({ digitalAssetId: 'asset_1' }),
      }),
      params
    )

    expect(response.status).toBe(200)
    expect(mocks.unlinkDigitalAssetFromProduct).toHaveBeenCalledWith('store_1', 'prod_1', 'asset_1')
  })
})

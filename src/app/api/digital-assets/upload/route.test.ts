import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminOrAbove: vi.fn(),
  getStoreSettingsLite: vi.fn(),
  createDigitalAssetMetadata: vi.fn(),
  storePrivateDigitalAssetFile: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdminOrAbove: mocks.requireAdminOrAbove,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

vi.mock('@/server/services/digital-asset.service', () => ({
  createDigitalAssetMetadata: mocks.createDigitalAssetMetadata,
}))

vi.mock('@/server/services/digital-asset-upload.service', async () => {
  const actual = await vi.importActual('@/server/services/digital-asset-upload.service')
  return {
    ...actual,
    storePrivateDigitalAssetFile: mocks.storePrivateDigitalAssetFile,
  }
})

import { POST } from './route'

describe('api/digital-assets/upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStoreSettingsLite.mockResolvedValue({ id: 'store_1' })
    mocks.storePrivateDigitalAssetFile.mockResolvedValue({
      storageProvider: 'local-private',
      storageKey: 'store_1/private-file.pdf',
    })
    mocks.createDigitalAssetMetadata.mockResolvedValue({
      id: 'asset_1',
      title: 'Guide',
      fileName: 'guide.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
      createdAt: new Date('2026-05-28T00:00:00.000Z'),
    })
  })

  it('rejects unauthenticated requests', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const formData = new FormData()
    formData.set('file', new File([Buffer.from('%PDF-1.7 test')], 'guide.pdf', { type: 'application/pdf' }))
    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(401)
  })

  it('rejects STAFF/non-owner-admin requests', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const formData = new FormData()
    formData.set('file', new File([Buffer.from('%PDF-1.7 test')], 'guide.pdf', { type: 'application/pdf' }))
    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(403)
  })

  it('rejects empty files', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'ADMIN' },
    })

    const formData = new FormData()
    formData.set('file', new File([new Uint8Array(0)], 'empty.txt', { type: 'text/plain' }))
    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(400)

    const payload = await response.json()
    expect(payload.error).toContain('empty')
  })

  it('rejects oversized files', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'OWNER' },
    })

    const oversized = new Uint8Array(25 * 1024 * 1024 + 1)
    const formData = new FormData()
    formData.set('file', new File([oversized], 'big.txt', { type: 'text/plain' }))
    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(400)

    const payload = await response.json()
    expect(payload.error).toContain('Maximum size is 25 MB')
  })

  it('rejects unsupported file contents', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'ADMIN' },
    })

    const binary = new Uint8Array([0x00, 0x91, 0x83, 0xf4, 0x10])
    const formData = new FormData()
    formData.set('file', new File([binary], 'payload.bin', { type: 'application/octet-stream' }))
    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(400)
  })

  it('accepts owner/admin upload and returns safe metadata only', async () => {
    mocks.requireAdminOrAbove.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', role: 'ADMIN' },
    })

    const formData = new FormData()
    formData.set('title', 'Field Guide')
    formData.set('file', new File([Buffer.from('%PDF-1.7 fake')], 'guide.pdf', { type: 'application/pdf' }))

    const response = await POST(new Request('http://localhost/api/digital-assets/upload', { method: 'POST', body: formData }))
    expect(response.status).toBe(201)
    expect(mocks.storePrivateDigitalAssetFile).toHaveBeenCalled()
    expect(mocks.createDigitalAssetMetadata).toHaveBeenCalledWith(
      'store_1',
      expect.objectContaining({
        title: 'Field Guide',
        fileName: 'guide.pdf',
        contentType: 'application/pdf',
      })
    )

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.asset).toMatchObject({
      id: 'asset_1',
      title: 'Guide',
      fileName: 'guide.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
    })
    expect(JSON.stringify(payload)).not.toContain('storageKey')
    expect(JSON.stringify(payload)).not.toContain('"url"')
  })
})

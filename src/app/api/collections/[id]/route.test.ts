import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCollection: vi.fn(),
  getCollectionIdentity: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  revalidatePath: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/server/services/collection.service', () => ({
  getCollection: mocks.getCollection,
  getCollectionIdentity: mocks.getCollectionIdentity,
  updateCollection: mocks.updateCollection,
  deleteCollection: mocks.deleteCollection,
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

import { DELETE, GET, PATCH } from './route'

describe('collection id route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'user_1', email: 'staff@example.com', role: 'STAFF' },
    })
  })

  it('requires route-level admin authorization before reading collection details', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })

    const response = await GET(new Request('http://localhost/api/collections/col_1'), {
      params: Promise.resolve({ id: 'col_1' }),
    })

    expect(response.status).toBe(403)
    expect(mocks.getCollection).not.toHaveBeenCalled()
  })

  it('returns 404 when a collection does not exist', async () => {
    mocks.getCollection.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/collections/col_missing'), {
      params: Promise.resolve({ id: 'col_missing' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Collection not found',
    })
  })

  it('patches collection publish state and product order, then revalidates old and new handles', async () => {
    mocks.getCollectionIdentity.mockResolvedValue({
      id: 'col_1',
      handle: 'old-handle',
    })
    mocks.updateCollection.mockResolvedValue({
      id: 'col_1',
      handle: 'new-handle',
      isPublished: false,
      productIds: ['prod_2', 'prod_1'],
    })

    const response = await PATCH(
      new Request('http://localhost/api/collections/col_1', {
        method: 'PATCH',
        body: JSON.stringify({
          handle: 'new-handle',
          isPublished: false,
          productIds: ['prod_2', 'prod_1'],
          sortOrder: 'MANUAL',
          imageUrl: '',
        }),
      }),
      { params: Promise.resolve({ id: 'col_1' }) }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: 'col_1',
        handle: 'new-handle',
        isPublished: false,
        productIds: ['prod_2', 'prod_1'],
      },
    })
    expect(mocks.updateCollection).toHaveBeenCalledWith('col_1', {
      handle: 'new-handle',
      isPublished: false,
      productIds: ['prod_2', 'prod_1'],
      sortOrder: 'MANUAL',
      imageUrl: '',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections/old-handle')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections/new-handle')
  })

  it('returns 404 when deleting a missing collection', async () => {
    mocks.getCollectionIdentity.mockResolvedValue(null)

    const response = await DELETE(
      new Request('http://localhost/api/collections/col_missing', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'col_missing' }) }
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Collection not found',
    })
    expect(mocks.deleteCollection).not.toHaveBeenCalled()
  })

  it('deletes collections and revalidates storefront paths', async () => {
    mocks.getCollectionIdentity.mockResolvedValue({
      id: 'col_1',
      handle: 'spring-drop',
    })
    mocks.deleteCollection.mockResolvedValue({
      id: 'col_1',
      handle: 'spring-drop',
    })

    const response = await DELETE(
      new Request('http://localhost/api/collections/col_1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'col_1' }) }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: 'col_1',
        handle: 'spring-drop',
      },
    })
    expect(mocks.deleteCollection).toHaveBeenCalledWith('col_1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections/spring-drop')
  })
})

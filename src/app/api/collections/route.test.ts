import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCollectionSummaries: vi.fn(),
  createCollection: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/server/services/collection.service', () => ({
  getCollectionSummaries: mocks.getCollectionSummaries,
  createCollection: mocks.createCollection,
}))

import { GET, POST } from './route'

describe('collections route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the optional search query through to collection summaries', async () => {
    mocks.getCollectionSummaries.mockResolvedValue({
      collections: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    })

    const response = await GET(new Request('http://localhost/api/collections?search=drop'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        collections: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      },
    })
    expect(mocks.getCollectionSummaries).toHaveBeenCalledWith({
      search: 'drop',
      page: 1,
      pageSize: 25,
    })
  })

  it('forwards explicit pagination query values to the collection summary service', async () => {
    mocks.getCollectionSummaries.mockResolvedValue({
      collections: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    })

    await GET(new Request('http://localhost/api/collections?page=0&pageSize=999'))

    expect(mocks.getCollectionSummaries).toHaveBeenCalledWith({
      search: undefined,
      page: 0,
      pageSize: 999,
    })
  })

  it('returns 422 when collection creation payload validation fails', async () => {
    const response = await POST(
      new Request('http://localhost/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          title: '',
        }),
      })
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Invalid collection payload',
    })
    expect(mocks.createCollection).not.toHaveBeenCalled()
  })

  it('creates collections with product assignment and revalidates storefront paths', async () => {
    mocks.createCollection.mockResolvedValue({
      id: 'col_1',
      title: 'Spring Drop',
      handle: 'spring-drop',
      productIds: ['prod_2', 'prod_1'],
      isPublished: false,
    })

    const response = await POST(
      new Request('http://localhost/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Spring Drop',
          description: 'Seasonal picks',
          sortOrder: 'TITLE_ASC',
          isPublished: false,
          productIds: ['prod_2', 'prod_1'],
          imageUrl: '',
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: 'col_1',
        title: 'Spring Drop',
        handle: 'spring-drop',
        productIds: ['prod_2', 'prod_1'],
        isPublished: false,
      },
    })
    expect(mocks.createCollection).toHaveBeenCalledWith({
      title: 'Spring Drop',
      description: 'Seasonal picks',
      sortOrder: 'TITLE_ASC',
      isPublished: false,
      productIds: ['prod_2', 'prod_1'],
      imageUrl: undefined,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/collections/spring-drop')
  })
})

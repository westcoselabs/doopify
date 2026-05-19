import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { createCollection, getCollectionSummaries } from '@/server/services/collection.service'

const COLLECTION_SORT_VALUES = ['MANUAL', 'NEWEST', 'TITLE_ASC', 'PRICE_ASC', 'PRICE_DESC'] as const

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  handle: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.union([z.string().url(), z.literal('')]).optional(),
  sortOrder: z.enum(COLLECTION_SORT_VALUES).optional(),
  isPublished: z.boolean().optional(),
  productIds: z.array(z.string().min(1)).optional(),
})

function revalidateCollectionPaths(handle?: string) {
  revalidatePath('/')
  revalidatePath('/shop')
  revalidatePath('/collections')

  if (handle) {
    revalidatePath(`/collections/${handle}`)
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const result = await getCollectionSummaries({
      search: searchParams.get('search') || undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 25),
    })
    return ok(result)
  } catch (error) {
    console.error('[GET /api/collections]', error)
    return err('Failed to fetch collections', 500)
  }
}

export async function POST(req: Request) {
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Invalid collection payload', parsed.error.flatten())
  }

  try {
    const collection = await createCollection({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || undefined,
    })

    if (!collection) {
      return err('Failed to create collection', 500)
    }

    revalidateCollectionPaths(collection.handle)
    return ok(collection, 201)
  } catch (error) {
    console.error('[POST /api/collections]', error)
    return err('Failed to create collection', 500)
  }
}

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import {
  deleteCollection,
  getCollection,
  getCollectionIdentity,
  updateCollection,
} from '@/server/services/collection.service'

interface Params {
  params: Promise<{ id: string }>
}

const COLLECTION_SORT_VALUES = ['MANUAL', 'NEWEST', 'TITLE_ASC', 'PRICE_ASC', 'PRICE_DESC'] as const

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  handle: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.union([z.string().url(), z.literal('')]).optional(),
  sortOrder: z.enum(COLLECTION_SORT_VALUES).optional(),
  isPublished: z.boolean().optional(),
  productIds: z.array(z.string().min(1)).optional(),
})

function revalidateCollectionPaths(handles: string[]) {
  revalidatePath('/')
  revalidatePath('/shop')
  revalidatePath('/collections')

  for (const handle of Array.from(new Set(handles))) {
    if (!handle) continue
    revalidatePath(`/collections/${handle}`)
  }
}

export async function GET(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const collection = await getCollection(id)
    if (!collection) return err('Collection not found', 404)
    return ok(collection)
  } catch (error) {
    console.error('[GET /api/collections/[id]]', error)
    return err('Failed to fetch collection', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Invalid collection payload', parsed.error.flatten())
  }

  try {
    const existing = await getCollectionIdentity(id)
    if (!existing) return err('Collection not found', 404)

    const updated = await updateCollection(id, {
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || '',
    })

    if (!updated) return err('Collection not found', 404)

    revalidateCollectionPaths([existing.handle, updated.handle])
    return ok(updated)
  } catch (error) {
    console.error('[PATCH /api/collections/[id]]', error)
    return err('Failed to update collection', 500)
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const existing = await getCollectionIdentity(id)
    if (!existing) return err('Collection not found', 404)

    const deleted = await deleteCollection(id)
    revalidateCollectionPaths([existing.handle])
    return ok(deleted)
  } catch (error) {
    console.error('[DELETE /api/collections/[id]]', error)
    return err('Failed to delete collection', 500)
  }
}

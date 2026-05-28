import { z } from 'zod'

import { err, ok, parseBody } from '@/lib/api'
import { requireAdminOrAbove } from '@/server/auth/require-auth'
import {
  DigitalAssetServiceError,
  linkDigitalAssetToProduct,
  listProductDigitalAssets,
  unlinkDigitalAssetFromProduct,
} from '@/server/services/digital-asset.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

export const runtime = 'nodejs'

type Params = {
  params: Promise<{ id: string }>
}

const linkSchema = z.object({
  digitalAssetId: z.string().min(1),
  sortOrder: z.number().int().nonnegative().optional(),
})

const unlinkSchema = z.object({
  digitalAssetId: z.string().min(1),
})

async function requireStoreId() {
  const store = await getStoreSettingsLite()
  if (!store?.id) {
    throw new Error('Store is not configured')
  }
  return store.id
}

function toHttpError(error: unknown, fallback: string) {
  if (error instanceof DigitalAssetServiceError) {
    return err(error.message, error.status)
  }
  const message = error instanceof Error ? error.message : fallback
  if (message === 'Digital asset not found for store') {
    return err(message, 404)
  }
  return err(message, 500)
}

export async function GET(req: Request, { params }: Params) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const storeId = await requireStoreId()
    const assets = await listProductDigitalAssets(storeId, id)
    return ok({ assets })
  } catch (error) {
    console.error('[GET /api/products/[id]/digital-assets]', error)
    return toHttpError(error, 'Failed to fetch product digital assets')
  }
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const storeId = await requireStoreId()
    const link = await linkDigitalAssetToProduct(
      storeId,
      id,
      parsed.data.digitalAssetId,
      parsed.data.sortOrder
    )
    return ok(link, 201)
  } catch (error) {
    console.error('[POST /api/products/[id]/digital-assets]', error)
    return toHttpError(error, 'Failed to link digital asset to product')
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const storeId = await requireStoreId()
    const result = await unlinkDigitalAssetFromProduct(storeId, id, parsed.data.digitalAssetId)
    return ok(result)
  } catch (error) {
    console.error('[DELETE /api/products/[id]/digital-assets]', error)
    return toHttpError(error, 'Failed to unlink digital asset from product')
  }
}

import { z } from 'zod'

import { err, ok, parseBody } from '@/lib/api'
import { requireAdminOrAbove } from '@/server/auth/require-auth'
import {
  DigitalAssetServiceError,
  createDigitalAssetMetadata,
  listDigitalAssetsForStore,
} from '@/server/services/digital-asset.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

export const runtime = 'nodejs'

const createDigitalAssetSchema = z.object({
  title: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  storageProvider: z.string().min(1),
  storageKey: z.string().min(1),
  checksumSha256: z.string().min(1).optional().nullable(),
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

export async function GET(req: Request) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  try {
    const storeId = await requireStoreId()
    const assets = await listDigitalAssetsForStore(storeId)
    return ok({ assets })
  } catch (error) {
    console.error('[GET /api/digital-assets]', error)
    return toHttpError(error, 'Failed to list digital assets')
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = createDigitalAssetSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const storeId = await requireStoreId()
    const asset = await createDigitalAssetMetadata(storeId, parsed.data)
    return ok(asset, 201)
  } catch (error) {
    console.error('[POST /api/digital-assets]', error)
    return toHttpError(error, 'Failed to create digital asset metadata')
  }
}

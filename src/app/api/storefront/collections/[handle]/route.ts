import { err, ok } from '@/lib/api'
import { getStorefrontCollectionByHandle } from '@/server/services/collection.service'

interface Params {
  params: Promise<{ handle: string }>
}

export async function GET(req: Request, { params }: Params) {
  const { handle } = await params

  try {
    const query = new URL(req.url).searchParams
    const collection = await getStorefrontCollectionByHandle(handle, { page: Number(query.get('page')), pageSize: Number(query.get('pageSize')) })
    if (!collection) return err('Collection not found', 404)
    return ok(collection)
  } catch (error) {
    console.error('[GET /api/storefront/collections/[handle]]', error)
    return err('Failed to fetch collection', 500)
  }
}

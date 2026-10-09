import { err, ok } from '@/lib/api'
import { getStorefrontCollectionSummaries } from '@/server/services/collection.service'

export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams
    return ok(await getStorefrontCollectionSummaries({ page: Number(query.get('page')), pageSize: Number(query.get('pageSize')) }))
  } catch (error) {
    console.error('[GET /api/storefront/collections]', error)
    return err('Failed to fetch collections', 500)
  }
}

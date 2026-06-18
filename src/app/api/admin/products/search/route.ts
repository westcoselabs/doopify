import { ok, err } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

function parseLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_LIMIT)

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.round(parsed), 1), MAX_LIMIT)
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('query')?.trim() ?? ''
    const limit = parseLimit(searchParams.get('limit'))

    const products = await prisma.product.findMany({
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      where: {
        status: 'ACTIVE',
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { handle: { contains: query, mode: 'insensitive' } },
                {
                  variants: {
                    some: {
                      sku: {
                        contains: query,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        handle: true,
        status: true,
        fulfillmentType: true,
        variants: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
    })

    return ok({
      products: products.map((product) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        fulfillmentType: product.fulfillmentType,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku ?? null,
        })),
      })),
    })
  } catch (error) {
    console.error('[GET /api/admin/products/search]', error)
    return err('Failed to search products', 500)
  }
}

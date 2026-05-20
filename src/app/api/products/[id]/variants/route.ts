import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { dollarsToCents } from '@/lib/money'
import { requireAdmin } from '@/server/auth/require-auth'
import { createVariant } from '@/server/services/product.service'

interface Params { params: Promise<{ id: string }> }

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sku: z.string().optional(),
  price: z.number().min(0),
  compareAtPrice: z.number().optional(),
  inventory: z.number().int().min(0).optional(),
  continueSellingWhenOutOfStock: z.boolean().optional(),
  weight: z.number().optional(),
  weightUnit: z.string().optional(),
})

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id: productId } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const variant = await createVariant(productId, {
      ...parsed.data,
      priceCents: dollarsToCents(parsed.data.price),
      compareAtPriceCents:
        parsed.data.compareAtPrice === undefined ? undefined : dollarsToCents(parsed.data.compareAtPrice),
    })
    return ok(variant, 201)
  } catch (e) {
    console.error('[POST /api/products/[id]/variants]', e)
    return err('Failed to create variant', 500)
  }
}

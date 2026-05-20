import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { dollarsToCents } from '@/lib/money'
import { variantWeightSchema, variantWeightUnitSchema } from '@/app/api/products/variant-validation'
import { requireAdmin } from '@/server/auth/require-auth'
import { updateVariant, deleteVariant } from '@/server/services/product.service'

interface Params { params: Promise<{ id: string; variantId: string }> }

const schema = z.object({
  title: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().optional(),
  inventory: z.number().int().min(0).optional(),
  continueSellingWhenOutOfStock: z.boolean().optional(),
  weight: variantWeightSchema,
  weightUnit: variantWeightUnitSchema,
})

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { variantId } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = schema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const { price, compareAtPrice, ...variantFields } = parsed.data

    const variant = await updateVariant(variantId, {
      ...variantFields,
      ...(price !== undefined ? { priceCents: dollarsToCents(price) } : {}),
      ...(compareAtPrice !== undefined
        ? { compareAtPriceCents: dollarsToCents(compareAtPrice) }
        : {}),
    })
    return ok(variant)
  } catch (e) {
    console.error('[PATCH /api/products/[id]/variants/[variantId]]', e)
    return err('Failed to update variant', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdmin(_req)
  if (!auth.ok) return auth.response

  const { variantId } = await params
  try {
    await deleteVariant(variantId)
    return new Response(null, { status: 204 })
  } catch (e) {
    console.error('[DELETE /api/products/[id]/variants/[variantId]]', e)
    return err('Failed to delete variant', 500)
  }
}

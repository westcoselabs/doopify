import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { dollarsToCents } from '@/lib/money'
import { requireAdmin } from '@/server/auth/require-auth'
import { getProduct, updateProduct, archiveProduct, upsertOptions } from '@/server/services/product.service'

interface Params {
  params: Promise<{ id: string }>
}

const optionValueSchema = z.object({
  value: z.string().min(1),
  position: z.number().int().optional(),
})

const optionSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().optional(),
  values: z.array(optionValueSchema).min(1),
})

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().min(0),
  compareAtPrice: z.number().optional(),
  inventory: z.number().int().min(0).optional(),
  continueSellingWhenOutOfStock: z.boolean().optional(),
  weight: z.number().optional(),
  weightUnit: z.string().optional(),
  position: z.number().int().optional(),
})

const mediaSchema = z.object({
  assetId: z.string().min(1),
  position: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
})

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  handle: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  salesMode: z.enum(['STANDARD', 'COMING_SOON', 'PRESALE']).optional(),
  presaleStartsAt: z.string().datetime().nullable().optional(),
  presaleEndsAt: z.string().datetime().nullable().optional(),
  availableForPurchaseAt: z.string().datetime().nullable().optional(),
  expectedDeliveryText: z.string().nullable().optional(),
  availabilityMessage: z.string().nullable().optional(),
  storefrontBadgeText: z.string().nullable().optional(),
  fulfillmentType: z.enum(['PHYSICAL', 'DIGITAL']).optional(),
  description: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  options: z.array(optionSchema).optional(),
  variants: z.array(variantSchema).optional(),
  media: z.array(mediaSchema).optional(),
})

function revalidateProductPaths(handle?: string) {
  revalidatePath('/')
  revalidatePath('/shop')
  revalidatePath('/api/storefront/products')

  if (handle) {
    revalidatePath(`/shop/${handle}`)
    revalidatePath(`/api/storefront/products/${handle}`)
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  try {
    const product = await getProduct(id)
    if (!product) return err('Product not found', 404)
    return ok(product)
  } catch (e) {
    console.error('[GET /api/products/[id]]', e)
    return err('Failed to fetch product', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const { options, variants, media, ...productFields } = parsed.data
    let product = await updateProduct(id, {
      ...productFields,
      publishedAt:
        productFields.publishedAt === undefined
          ? undefined
          : productFields.publishedAt
            ? new Date(productFields.publishedAt)
            : null,
      presaleStartsAt:
        productFields.presaleStartsAt === undefined
          ? undefined
          : productFields.presaleStartsAt
            ? new Date(productFields.presaleStartsAt)
            : null,
      presaleEndsAt:
        productFields.presaleEndsAt === undefined
          ? undefined
          : productFields.presaleEndsAt
            ? new Date(productFields.presaleEndsAt)
            : null,
      availableForPurchaseAt:
        productFields.availableForPurchaseAt === undefined
          ? undefined
          : productFields.availableForPurchaseAt
            ? new Date(productFields.availableForPurchaseAt)
            : null,
      variants: variants?.map((variant) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        priceCents: dollarsToCents(variant.price),
        compareAtPriceCents:
          variant.compareAtPrice === undefined ? undefined : dollarsToCents(variant.compareAtPrice),
        inventory: variant.inventory,
        continueSellingWhenOutOfStock: variant.continueSellingWhenOutOfStock,
        weight: variant.weight,
        weightUnit: variant.weightUnit,
        position: variant.position,
      })),
      media,
    })

    if (!product) {
      return err('Product not found', 404)
    }

    if (options) {
      product = await upsertOptions(id, options)
    }

    if (!product) {
      return err('Product not found', 404)
    }

    revalidateProductPaths(product.handle)
    return ok(product)
  } catch (e) {
    console.error('[PATCH /api/products/[id]]', e)
    return err('Failed to update product', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdmin(_req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const existingProduct = await getProduct(id)
    if (!existingProduct) return err('Product not found', 404)

    await archiveProduct(id)
    revalidateProductPaths(existingProduct.handle)
    return ok({ message: 'Product archived' })
  } catch (e) {
    console.error('[DELETE /api/products/[id]]', e)
    return err('Failed to archive product', 500)
  }
}

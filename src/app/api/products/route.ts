import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ok, okWithWarning, err, parseBody } from '@/lib/api'
import { dollarsToCents } from '@/lib/money'
import { variantWeightSchema, variantWeightUnitSchema } from '@/app/api/products/variant-validation'
import { requireAdmin } from '@/server/auth/require-auth'
import { getProductSummaries, createProduct, upsertOptions } from '@/server/services/product.service'
import type { ProductStatus } from '@prisma/client'

export const runtime = 'nodejs'

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
  weight: variantWeightSchema,
  weightUnit: variantWeightUnitSchema,
  position: z.number().int().optional(),
})

const mediaSchema = z.object({
  assetId: z.string().min(1),
  position: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
})

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  handle: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  salesMode: z.enum(['STANDARD', 'COMING_SOON', 'PRESALE']).optional(),
  presaleStartsAt: z.string().datetime().nullable().optional(),
  presaleEndsAt: z.string().datetime().nullable().optional(),
  availableForPurchaseAt: z.string().datetime().nullable().optional(),
  expectedDeliveryText: z.string().optional(),
  availabilityMessage: z.string().optional(),
  storefrontBadgeText: z.string().optional(),
  fulfillmentType: z.enum(['PHYSICAL', 'DIGITAL']).optional(),
  description: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  variants: z.array(variantSchema).optional(),
  options: z.array(optionSchema).optional(),
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const result = await getProductSummaries({
      status: (searchParams.get('status') as ProductStatus) || undefined,
      search: searchParams.get('search') || undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 20),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
    })
    return ok(result)
  } catch (e: unknown) {
    console.error('[GET /api/products]', e)
    return err('Failed to fetch products', 500)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const { options, variants, media, ...productFields } = parsed.data

    const { product: coreProduct, mediaSyncError } = await createProduct({
      ...productFields,
      publishedAt: productFields.publishedAt ? new Date(productFields.publishedAt) : null,
      salesMode: productFields.salesMode,
      presaleStartsAt: productFields.presaleStartsAt ? new Date(productFields.presaleStartsAt) : null,
      presaleEndsAt: productFields.presaleEndsAt ? new Date(productFields.presaleEndsAt) : null,
      availableForPurchaseAt: productFields.availableForPurchaseAt
        ? new Date(productFields.availableForPurchaseAt)
        : null,
      expectedDeliveryText: productFields.expectedDeliveryText,
      availabilityMessage: productFields.availabilityMessage,
      storefrontBadgeText: productFields.storefrontBadgeText,
      fulfillmentType: productFields.fulfillmentType,
      variants: variants?.map((variant) => ({
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

    if (!coreProduct) {
      return err('Failed to create product', 500)
    }

    let product = coreProduct
    let optionsSyncError: string | undefined

    if (options?.length) {
      try {
        const withOptions = await upsertOptions(product.id, options)
        if (withOptions) {
          product = withOptions
        }
      } catch (e) {
        console.error('[POST /api/products] options sync failed:', e)
        optionsSyncError = e instanceof Error ? e.message : 'Options sync failed'
      }
    }

    revalidateProductPaths(product.handle)

    const warnings = [mediaSyncError, optionsSyncError].filter(Boolean)
    if (warnings.length) {
      return okWithWarning(product, `Product saved as draft. Could not attach: ${warnings.join('; ')}`, 201)
    }

    return ok(product, 201)
  } catch (e: unknown) {
    console.error('[POST /api/products]', e)
    return err('Failed to create product', 500)
  }
}

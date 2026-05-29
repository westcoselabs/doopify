import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { promotionPatchSchema } from '@/server/promotions/admin-api-schema'
import {
  disablePromotionForAdmin,
  getPromotionForAdmin,
  updatePromotionFromAdmin,
} from '@/server/promotions/admin-service'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const promotion = await getPromotionForAdmin(id)
    if (!promotion) return err('Promotion not found', 404)
    return ok({ promotion })
  } catch (error) {
    console.error('[GET /api/promotions/[id]]', error)
    return err('Failed to fetch promotion', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = promotionPatchSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Invalid promotion payload', parsed.error.flatten())
  }

  try {
    const result = await updatePromotionFromAdmin(id, parsed.data)
    if (!result.ok) {
      if ('notFound' in result && result.notFound) {
        return err('Promotion not found', 404)
      }
      return unprocessable('Invalid promotion payload', {
        errors: result.errors,
        warnings: result.warnings,
      })
    }

    return ok({
      promotion: result.promotion,
      warnings: result.warnings,
    })
  } catch (error) {
    console.error('[PATCH /api/promotions/[id]]', error)
    return err('Failed to update promotion', 500)
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const result = await disablePromotionForAdmin(id)
    if (!result) return err('Promotion not found', 404)
    return ok({ message: 'Promotion disabled' })
  } catch (error) {
    console.error('[DELETE /api/promotions/[id]]', error)
    return err('Failed to disable promotion', 500)
  }
}

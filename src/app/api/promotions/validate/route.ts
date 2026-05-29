import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { promotionCreateSchema } from '@/server/promotions/admin-api-schema'
import { validatePromotionForAdmin } from '@/server/promotions/admin-service'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = promotionCreateSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Invalid promotion payload', parsed.error.flatten())
  }

  try {
    const result = await validatePromotionForAdmin(parsed.data)
    if (!result.ok) {
      return unprocessable('Invalid promotion payload', {
        errors: result.errors,
        warnings: result.warnings,
      })
    }
    return ok(result)
  } catch (error) {
    console.error('[POST /api/promotions/validate]', error)
    return err('Failed to validate promotion', 500)
  }
}

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import {
  promotionCreateSchema,
  promotionStatusSchema,
  promotionTypeSchema,
} from '@/server/promotions/admin-api-schema'
import {
  clampPromotionListPage,
  clampPromotionListPageSize,
  DEFAULT_PROMOTION_LIST_PAGE_SIZE,
} from '@/server/promotions/admin-dto'
import { createPromotionFromAdmin, listPromotionsForAdmin } from '@/server/promotions/admin-service'
import type { PromotionStatus, PromotionType } from '@prisma/client'

function parseOptionalFilter<T extends string>(
  rawValue: string | null,
  parse: (value: string) => { success: true; data: T } | { success: false },
  invalidMessage: string
) {
  if (rawValue === null) {
    return { ok: true as const, value: undefined }
  }

  const parsed = parse(rawValue.trim().toUpperCase())
  if (!parsed.success) {
    return { ok: false as const, response: err(invalidMessage, 400) }
  }

  return { ok: true as const, value: parsed.data }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const page = clampPromotionListPage(Number(searchParams.get('page') || 1))
    const pageSize = clampPromotionListPageSize(
      Number(searchParams.get('pageSize') || DEFAULT_PROMOTION_LIST_PAGE_SIZE)
    )
    const statusFilter = parseOptionalFilter<PromotionStatus>(
      searchParams.get('status'),
      (value) => promotionStatusSchema.safeParse(value),
      'Invalid promotion status filter'
    )
    if (!statusFilter.ok) {
      return statusFilter.response
    }

    const typeFilter = parseOptionalFilter<PromotionType>(
      searchParams.get('type'),
      (value) => promotionTypeSchema.safeParse(value),
      'Invalid promotion type filter'
    )
    if (!typeFilter.ok) {
      return typeFilter.response
    }

    const status = statusFilter.value
    const type = typeFilter.value
    const search = String(searchParams.get('search') || '').trim() || undefined

    const result = await listPromotionsForAdmin({
      status,
      type,
      search,
      page,
      pageSize,
    })

    return ok(result)
  } catch (error) {
    console.error('[GET /api/promotions]', error)
    return err('Failed to fetch promotions', 500)
  }
}

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
    const result = await createPromotionFromAdmin(parsed.data)
    if (!result.ok) {
      return unprocessable('Invalid promotion payload', {
        errors: result.errors,
        warnings: result.warnings,
      })
    }

    return ok(
      {
        promotion: result.promotion,
        warnings: result.warnings,
      },
      201
    )
  } catch (error) {
    console.error('[POST /api/promotions]', error)
    return err('Failed to create promotion', 500)
  }
}

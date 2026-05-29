import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { promotionCreateSchema } from '@/server/promotions/admin-api-schema'
import {
  clampPromotionListPage,
  clampPromotionListPageSize,
  DEFAULT_PROMOTION_LIST_PAGE_SIZE,
} from '@/server/promotions/admin-dto'
import { createPromotionFromAdmin, listPromotionsForAdmin } from '@/server/promotions/admin-service'
import type { PromotionStatus, PromotionType } from '@prisma/client'

const PROMOTION_STATUSES = new Set<PromotionStatus>(['DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED'])
const PROMOTION_TYPES = new Set<PromotionType>(['PRODUCT_GROUP_DISCOUNT', 'BUY_X_GET_Y', 'FREE_GIFT'])

function parseStatusFilter(value: string | null): PromotionStatus | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  return PROMOTION_STATUSES.has(normalized as PromotionStatus)
    ? (normalized as PromotionStatus)
    : undefined
}

function parseTypeFilter(value: string | null): PromotionType | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  return PROMOTION_TYPES.has(normalized as PromotionType)
    ? (normalized as PromotionType)
    : undefined
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
    const status = parseStatusFilter(searchParams.get('status'))
    const type = parseTypeFilter(searchParams.get('type'))
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

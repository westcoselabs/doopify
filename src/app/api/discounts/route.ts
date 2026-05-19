import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const DEFAULT_DISCOUNT_LIST_PAGE_SIZE = 20
const MAX_DISCOUNT_LIST_PAGE_SIZE = 100

function clampPage(value: number) {
  return Math.max(1, Math.floor(Number(value || 1)))
}

function clampPageSize(value: number) {
  return Math.max(
    1,
    Math.min(MAX_DISCOUNT_LIST_PAGE_SIZE, Math.floor(Number(value || DEFAULT_DISCOUNT_LIST_PAGE_SIZE)))
  )
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = clampPage(Number(searchParams.get('page') || 1))
    const pageSize = clampPageSize(Number(searchParams.get('pageSize') || DEFAULT_DISCOUNT_LIST_PAGE_SIZE))
    const status = searchParams.get('status') || undefined

    const where = status ? { status: status as never } : {}

    const [discounts, total] = await Promise.all([
      prisma.discount.findMany({
        where,
        select: {
          id: true,
          code: true,
          title: true,
          type: true,
          method: true,
          value: true,
          minimumOrderCents: true,
          usageLimit: true,
          usageCount: true,
          status: true,
          startsAt: true,
          endsAt: true,
          combinesWithOrders: true,
          combinesWithProducts: true,
          combinesWithShipping: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.discount.count({ where }),
    ])

    return ok({ discounts, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } })
  } catch (e) {
    console.error('[GET /api/discounts]', e)
    return err('Failed to fetch discounts', 500)
  }
}

const createSchema = z.object({
  code: z.string().optional(),
  title: z.string().min(1),
  type: z.enum(['CODE', 'AUTOMATIC']),
  method: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y']),
  value: z.number().min(0),
  minimumOrder: z.number().optional(),
  usageLimit: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED']).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  combinesWithOrders: z.boolean().optional(),
  combinesWithProducts: z.boolean().optional(),
  combinesWithShipping: z.boolean().optional(),
})

export async function POST(req: Request) {
  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const discount = await prisma.discount.create({
      data: {
        ...parsed.data,
        // Normalize to uppercase so validation is always case-insensitive
        code: parsed.data.code ? parsed.data.code.toUpperCase() : undefined,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      },
    })
    return ok(discount, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes('Unique')
      ? 'A discount with this code already exists'
      : 'Failed to create discount'
    return err(msg, 500)
  }
}

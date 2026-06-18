import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/auth/require-auth'

interface Params { params: Promise<{ id: string }> }

const updateSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(['CODE', 'AUTOMATIC']).optional(),
  method: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y']).optional(),
  status: z.enum(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED']).optional(),
  value: z.number().min(0).optional(),
  minimumOrder: z.number().min(0).nullable().optional(),
  minimumOrderCents: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  combinesWithOrders: z.boolean().optional(),
  combinesWithProducts: z.boolean().optional(),
  combinesWithShipping: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.startsAt && value.endsAt) {
    const startsAt = new Date(value.startsAt)
    const endsAt = new Date(value.endsAt)
    if (startsAt > endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startsAt cannot be after endsAt',
        path: ['startsAt'],
      })
    }
  }
})

function resolveMinimumOrderCents(input: { minimumOrder?: number | null; minimumOrderCents?: number | null }) {
  if (input.minimumOrderCents === null || input.minimumOrder === null) return null
  if (input.minimumOrderCents != null) return input.minimumOrderCents
  if (input.minimumOrder != null) return dollarsToCents(input.minimumOrder)
  return undefined
}

function mapDiscountResponse(discount: { minimumOrderCents: number | null; [key: string]: unknown }) {
  return {
    ...discount,
    minimumOrder:
      discount.minimumOrderCents == null ? null : centsToDollars(discount.minimumOrderCents),
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
  if (parsed.data.method === 'BUY_X_GET_Y') {
    return err('BUY_X_GET_Y discounts are not supported at checkout yet')
  }

  const minimumOrderCents = resolveMinimumOrderCents(parsed.data)

  try {
    const discount = await prisma.discount.update({
      where: { id },
      data: {
        code: parsed.data.code ? parsed.data.code.toUpperCase() : undefined,
        title: parsed.data.title,
        type: parsed.data.type,
        method: parsed.data.method,
        status: parsed.data.status,
        value: parsed.data.value,
        minimumOrderCents,
        usageLimit: parsed.data.usageLimit === null ? null : parsed.data.usageLimit,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : parsed.data.startsAt === null ? null : undefined,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : parsed.data.endsAt === null ? null : undefined,
        combinesWithOrders: parsed.data.combinesWithOrders,
        combinesWithProducts: parsed.data.combinesWithProducts,
        combinesWithShipping: parsed.data.combinesWithShipping,
      },
    })
    return ok(mapDiscountResponse(discount))
  } catch (e) {
    console.error('[PATCH /api/discounts/[id]]', e)
    const message =
      e instanceof Error && (e.message.includes('Unique') || e.message.toLowerCase().includes('duplicate'))
        ? 'A discount with this code already exists'
        : 'Failed to update discount'
    return err(message, 500)
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    await prisma.discount.update({ where: { id }, data: { status: 'DISABLED' } })
    return ok({ message: 'Discount disabled' })
  } catch (e) {
    console.error('[DELETE /api/discounts/[id]]', e)
    return err('Failed to disable discount', 500)
  }
}

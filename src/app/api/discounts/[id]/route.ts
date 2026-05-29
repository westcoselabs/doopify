import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/auth/require-auth'

interface Params { params: Promise<{ id: string }> }

const updateSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED']).optional(),
  value: z.number().min(0).optional(),
  minimumOrder: z.number().min(0).optional(),
  minimumOrderCents: z.number().int().min(0).optional(),
  usageLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
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

function resolveMinimumOrderCents(input: { minimumOrder?: number; minimumOrderCents?: number }) {
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

  const minimumOrderCents = resolveMinimumOrderCents(parsed.data)

  try {
    const discount = await prisma.discount.update({
      where: { id },
      data: {
        code: parsed.data.code ? parsed.data.code.toUpperCase() : undefined,
        title: parsed.data.title,
        status: parsed.data.status,
        value: parsed.data.value,
        minimumOrderCents,
        usageLimit: parsed.data.usageLimit,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      },
    })
    return ok(mapDiscountResponse(discount))
  } catch (e) {
    console.error('[PATCH /api/discounts/[id]]', e)
    return err('Failed to update discount', 500)
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

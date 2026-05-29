import { prisma } from '@/lib/prisma'
import type {
  PromotionDraftInput,
  PromotionRewardDefinition,
  PromotionValidationIssue,
  PromotionVariantCatalogEntry,
} from '@/server/promotions/contracts'
import { validatePromotionDraft } from '@/server/promotions/validation'
import {
  promotionDetailInclude,
  promotionListSelect,
  toPromotionDetailDto,
  toPromotionListItemDto,
} from '@/server/promotions/admin-dto'
import type { PromotionStatus, PromotionType, PromotionRewardType, Prisma } from '@prisma/client'

type PromotionQualifierInput = {
  variantId: string
  requiredQuantity: number
}

type PromotionRewardInput = {
  variantId: string
  rewardQuantity: number
}

type PromotionUpsertInput = {
  name: string
  status?: PromotionStatus
  type: PromotionType
  rewardType: PromotionRewardType
  value: number
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  usageLimit?: number | null
  priority?: number | null
  qualifiers: PromotionQualifierInput[]
  rewards?: PromotionRewardInput[]
}

export type PromotionCreateInput = PromotionUpsertInput

export type PromotionPatchInput = Partial<
  Omit<PromotionUpsertInput, 'name' | 'type' | 'rewardType' | 'value' | 'qualifiers' | 'rewards'>
> & {
  name?: string
  type?: PromotionType
  rewardType?: PromotionRewardType
  value?: number
  qualifiers?: PromotionQualifierInput[]
  rewards?: PromotionRewardInput[]
  usageCount?: number
}

export type PromotionListQuery = {
  status?: PromotionStatus
  type?: PromotionType
  search?: string
  page: number
  pageSize: number
}

export type PromotionValidationResponse = {
  ok: boolean
  errors: PromotionValidationIssue[]
  warnings: PromotionValidationIssue[]
}

type VariantCatalogRecord = {
  id: string
  title: string
  productId: string
  product: {
    id: string
    title: string
    status: string
    fulfillmentType: string
  }
}

function normalizeVariantId(value: string) {
  return String(value || '').trim()
}

function normalizeQualifierRows(rows: PromotionQualifierInput[]) {
  return (rows ?? []).map((row) => ({
    variantId: normalizeVariantId(row.variantId),
    requiredQuantity: Number(row.requiredQuantity),
  }))
}

function normalizeRewardRows(rows: PromotionRewardInput[]) {
  return (rows ?? []).map((row) => ({
    variantId: normalizeVariantId(row.variantId),
    rewardQuantity: Number(row.rewardQuantity),
  }))
}

function parseMaybeDate(value: Date | string | null | undefined) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed
}

function createError(path: string, code: string, message: string): PromotionValidationIssue {
  return { path, code, message }
}

function asVariantCatalogById(rows: VariantCatalogRecord[]) {
  const catalog: Record<string, PromotionVariantCatalogEntry> = {}
  for (const row of rows) {
    catalog[row.id] = {
      variantId: row.id,
      productId: row.productId,
      fulfillmentType:
        row.product.fulfillmentType === 'PHYSICAL' || row.product.fulfillmentType === 'DIGITAL'
          ? row.product.fulfillmentType
          : null,
    }
  }
  return catalog
}

function buildVariantLookupRows(input: PromotionDraftInput) {
  const variantIds = Array.from(
    new Set([
      ...input.qualifiers.map((row) => normalizeVariantId(row.variantId)),
      ...(input.rewards ?? []).map((row) => normalizeVariantId(row.variantId)),
    ])
  ).filter(Boolean)

  return variantIds
}

async function loadVariantCatalogRows(variantIds: string[]) {
  if (!variantIds.length) return [] as VariantCatalogRecord[]

  return prisma.productVariant.findMany({
    where: {
      id: {
        in: variantIds,
      },
    },
    select: {
      id: true,
      title: true,
      productId: true,
      product: {
        select: {
          id: true,
          title: true,
          status: true,
          fulfillmentType: true,
        },
      },
    },
  })
}

function normalizeDraftInput(input: PromotionUpsertInput): PromotionDraftInput {
  return {
    name: String(input.name ?? ''),
    status: input.status,
    type: input.type,
    rewardType: input.rewardType,
    value: Number(input.value),
    startsAt: parseMaybeDate(input.startsAt),
    endsAt: parseMaybeDate(input.endsAt),
    usageLimit: input.usageLimit == null ? null : Number(input.usageLimit),
    priority: input.priority == null ? null : Number(input.priority),
    qualifiers: normalizeQualifierRows(input.qualifiers),
    rewards: normalizeRewardRows(input.rewards ?? []),
  }
}

function buildProductStatusIssues(input: PromotionDraftInput, variantRows: VariantCatalogRecord[]) {
  const issues: PromotionValidationIssue[] = []
  const variantById = new Map(variantRows.map((row) => [row.id, row]))

  for (const [index, qualifier] of input.qualifiers.entries()) {
    const variant = variantById.get(normalizeVariantId(qualifier.variantId))
    if (!variant) continue
    if (variant.product.status !== 'ACTIVE') {
      issues.push(
        createError(
          `qualifiers[${index}].variantId`,
          'INACTIVE_VARIANT_NOT_ALLOWED',
          `Variant ${variant.id} belongs to a product that is not ACTIVE.`
        )
      )
    }
  }

  for (const [index, reward] of (input.rewards ?? []).entries()) {
    const variant = variantById.get(normalizeVariantId(reward.variantId))
    if (!variant) continue
    if (variant.product.status !== 'ACTIVE') {
      issues.push(
        createError(
          `rewards[${index}].variantId`,
          'INACTIVE_VARIANT_NOT_ALLOWED',
          `Variant ${variant.id} belongs to a product that is not ACTIVE.`
        )
      )
    }
  }

  return issues
}

function buildV1PolicyIssues(input: PromotionDraftInput) {
  const issues: PromotionValidationIssue[] = []
  const rewards = input.rewards ?? []

  if (input.type === 'PRODUCT_GROUP_DISCOUNT' && rewards.length > 0) {
    issues.push(
      createError(
        'rewards',
        'PRODUCT_GROUP_REWARDS_NOT_ALLOWED',
        'PRODUCT_GROUP_DISCOUNT promotions must not include reward rows in Smart Promotions V1.'
      )
    )
  }

  return issues
}

function buildDraftRows(input: PromotionDraftInput, variantRows: VariantCatalogRecord[]) {
  const variantById = new Map(variantRows.map((row) => [row.id, row]))

  const qualifiers = input.qualifiers.map((qualifier) => {
    const variant = variantById.get(normalizeVariantId(qualifier.variantId))
    return {
      productId: variant?.productId,
      variantId: normalizeVariantId(qualifier.variantId),
      requiredQuantity: Number(qualifier.requiredQuantity),
    }
  })

  const rewards = (input.rewards ?? []).map((reward) => {
    const variant = variantById.get(normalizeVariantId(reward.variantId))
    return {
      productId: variant?.productId,
      variantId: normalizeVariantId(reward.variantId),
      rewardQuantity: Number(reward.rewardQuantity),
    }
  })

  return {
    qualifiers,
    rewards,
  }
}

async function validatePromotionDraftWithDbContext(input: PromotionDraftInput) {
  const variantIds = buildVariantLookupRows(input)
  const variantRows = await loadVariantCatalogRows(variantIds)
  const variantCatalogById = asVariantCatalogById(variantRows)

  const baseValidation = validatePromotionDraft(input, { variantCatalogById })
  const productStatusIssues = buildProductStatusIssues(input, variantRows)
  const v1PolicyIssues = buildV1PolicyIssues(input)

  const errors = [...baseValidation.errors, ...productStatusIssues, ...v1PolicyIssues]

  return {
    ok: errors.length === 0,
    errors,
    warnings: baseValidation.warnings,
    variantRows,
  }
}

function promotionWhereFromListQuery(query: PromotionListQuery): Prisma.PromotionWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.search
      ? {
          name: {
            contains: query.search,
            mode: 'insensitive',
          },
        }
      : {}),
  }
}

export async function listPromotionsForAdmin(query: PromotionListQuery) {
  const where = promotionWhereFromListQuery(query)

  const [promotions, total] = await Promise.all([
    prisma.promotion.findMany({
      where,
      select: promotionListSelect,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.promotion.count({ where }),
  ])

  return {
    promotions: promotions.map(toPromotionListItemDto),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export async function getPromotionForAdmin(id: string) {
  const promotion = await prisma.promotion.findUnique({
    where: { id },
    include: promotionDetailInclude,
  })

  if (!promotion) return null
  return toPromotionDetailDto(promotion)
}

export async function validatePromotionForAdmin(input: PromotionCreateInput): Promise<PromotionValidationResponse> {
  const draft = normalizeDraftInput(input)
  const validation = await validatePromotionDraftWithDbContext(draft)
  return {
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
  }
}

export async function createPromotionFromAdmin(input: PromotionCreateInput) {
  const draft = normalizeDraftInput(input)
  const validation = await validatePromotionDraftWithDbContext(draft)

  if (!validation.ok) {
    return {
      ok: false as const,
      errors: validation.errors,
      warnings: validation.warnings,
    }
  }

  const rows = buildDraftRows(draft, validation.variantRows)

  const created = await prisma.$transaction(async (tx) => {
    const promotion = await tx.promotion.create({
      data: {
        name: draft.name.trim(),
        status: draft.status ?? 'DRAFT',
        type: draft.type,
        rewardType: draft.rewardType,
        value: Math.round(draft.value),
        startsAt: draft.startsAt instanceof Date ? draft.startsAt : null,
        endsAt: draft.endsAt instanceof Date ? draft.endsAt : null,
        usageLimit: draft.usageLimit == null ? null : Math.round(draft.usageLimit),
        priority: draft.priority == null ? 100 : Math.round(draft.priority),
        qualifiers: {
          create: rows.qualifiers.map((qualifier) => ({
            productId: String(qualifier.productId || ''),
            variantId: qualifier.variantId,
            requiredQuantity: Math.round(qualifier.requiredQuantity),
          })),
        },
        rewards: rows.rewards.length
          ? {
              create: rows.rewards.map((reward) => ({
                productId: String(reward.productId || ''),
                variantId: reward.variantId,
                rewardQuantity: Math.round(reward.rewardQuantity),
              })),
            }
          : undefined,
      },
      select: { id: true },
    })

    return tx.promotion.findUnique({
      where: { id: promotion.id },
      include: promotionDetailInclude,
    })
  })

  if (!created) {
    throw new Error('Failed to create promotion')
  }

  return {
    ok: true as const,
    promotion: toPromotionDetailDto(created),
    warnings: validation.warnings,
  }
}

function toCreateInputFromExisting(promotion: Prisma.PromotionGetPayload<{ include: typeof promotionDetailInclude }>) {
  return {
    name: promotion.name,
    status: promotion.status,
    type: promotion.type,
    rewardType: promotion.rewardType,
    value: promotion.value,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    usageLimit: promotion.usageLimit,
    priority: promotion.priority,
    qualifiers: promotion.qualifiers.map((qualifier) => ({
      variantId: qualifier.variantId,
      requiredQuantity: qualifier.requiredQuantity,
    })),
    rewards: promotion.rewards.map((reward) => ({
      variantId: reward.variantId,
      rewardQuantity: reward.rewardQuantity,
    })),
  } satisfies PromotionCreateInput
}

export async function updatePromotionFromAdmin(id: string, input: PromotionPatchInput) {
  if (Object.prototype.hasOwnProperty.call(input, 'usageCount')) {
    return {
      ok: false as const,
      errors: [
        createError(
          'usageCount',
          'IMMUTABLE_FIELD',
          'usageCount cannot be updated through the admin promotions API.'
        ),
      ],
      warnings: [] as PromotionValidationIssue[],
    }
  }

  const existing = await prisma.promotion.findUnique({
    where: { id },
    include: promotionDetailInclude,
  })

  if (!existing) {
    return {
      ok: false as const,
      notFound: true as const,
      errors: [createError('id', 'NOT_FOUND', 'Promotion not found.')],
      warnings: [] as PromotionValidationIssue[],
    }
  }

  const fullInput: PromotionCreateInput = {
    ...toCreateInputFromExisting(existing),
    ...(input.name != null ? { name: input.name } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.rewardType !== undefined ? { rewardType: input.rewardType } : {}),
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'startsAt') ? { startsAt: input.startsAt } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'endsAt') ? { endsAt: input.endsAt } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'usageLimit') ? { usageLimit: input.usageLimit } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'priority') ? { priority: input.priority } : {}),
    ...(input.qualifiers ? { qualifiers: input.qualifiers } : {}),
    ...(input.rewards ? { rewards: input.rewards } : {}),
  }

  const draft = normalizeDraftInput(fullInput)
  const validation = await validatePromotionDraftWithDbContext(draft)

  if (!validation.ok) {
    return {
      ok: false as const,
      errors: validation.errors,
      warnings: validation.warnings,
    }
  }

  const rows = buildDraftRows(draft, validation.variantRows)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.promotion.update({
      where: { id },
      data: {
        name: draft.name.trim(),
        status: draft.status ?? existing.status,
        type: draft.type,
        rewardType: draft.rewardType,
        value: Math.round(draft.value),
        startsAt: draft.startsAt instanceof Date ? draft.startsAt : null,
        endsAt: draft.endsAt instanceof Date ? draft.endsAt : null,
        usageLimit: draft.usageLimit == null ? null : Math.round(draft.usageLimit),
        priority: draft.priority == null ? existing.priority : Math.round(draft.priority),
      },
    })

    if (input.qualifiers) {
      await tx.promotionQualifier.deleteMany({
        where: { promotionId: id },
      })

      await tx.promotionQualifier.createMany({
        data: rows.qualifiers.map((qualifier) => ({
          promotionId: id,
          productId: String(qualifier.productId || ''),
          variantId: qualifier.variantId,
          requiredQuantity: Math.round(qualifier.requiredQuantity),
        })),
      })
    }

    if (input.rewards) {
      await tx.promotionReward.deleteMany({
        where: { promotionId: id },
      })

      if (rows.rewards.length) {
        await tx.promotionReward.createMany({
          data: rows.rewards.map((reward) => ({
            promotionId: id,
            productId: String(reward.productId || ''),
            variantId: reward.variantId,
            rewardQuantity: Math.round(reward.rewardQuantity),
          })),
        })
      }
    }

    return tx.promotion.findUnique({
      where: { id },
      include: promotionDetailInclude,
    })
  })

  if (!updated) {
    return {
      ok: false as const,
      notFound: true as const,
      errors: [createError('id', 'NOT_FOUND', 'Promotion not found.')],
      warnings: [] as PromotionValidationIssue[],
    }
  }

  return {
    ok: true as const,
    promotion: toPromotionDetailDto(updated),
    warnings: validation.warnings,
  }
}

export async function disablePromotionForAdmin(id: string) {
  const updated = await prisma.promotion.updateMany({
    where: { id },
    data: { status: 'DISABLED' },
  })

  if (updated.count === 0) {
    return null
  }

  return { id, status: 'DISABLED' as const }
}

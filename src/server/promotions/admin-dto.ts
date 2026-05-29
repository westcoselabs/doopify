import type { Prisma } from '@prisma/client'

export const DEFAULT_PROMOTION_LIST_PAGE_SIZE = 20
export const MAX_PROMOTION_LIST_PAGE_SIZE = 100

export const promotionListSelect = {
  id: true,
  name: true,
  status: true,
  type: true,
  rewardType: true,
  value: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  usageCount: true,
  priority: true,
  updatedAt: true,
  createdAt: true,
  _count: {
    select: {
      qualifiers: true,
      rewards: true,
    },
  },
} satisfies Prisma.PromotionSelect

export const promotionDetailInclude = {
  qualifiers: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      product: {
        select: {
          id: true,
          title: true,
          fulfillmentType: true,
        },
      },
      variant: {
        select: {
          id: true,
          title: true,
          sku: true,
        },
      },
    },
  },
  rewards: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      product: {
        select: {
          id: true,
          title: true,
          fulfillmentType: true,
        },
      },
      variant: {
        select: {
          id: true,
          title: true,
          sku: true,
        },
      },
    },
  },
} satisfies Prisma.PromotionInclude

type PromotionListRecord = Prisma.PromotionGetPayload<{
  select: typeof promotionListSelect
}>

type PromotionDetailRecord = Prisma.PromotionGetPayload<{
  include: typeof promotionDetailInclude
}>

export type PromotionListItemDto = {
  id: string
  name: string
  status: string
  type: string
  rewardType: string
  value: number
  startsAt: Date | null
  endsAt: Date | null
  usageLimit: number | null
  usageCount: number
  priority: number
  qualifierCount: number
  rewardCount: number
  updatedAt: Date
  createdAt: Date
}

export type PromotionDetailDto = {
  id: string
  name: string
  status: string
  type: string
  rewardType: string
  value: number
  startsAt: Date | null
  endsAt: Date | null
  usageLimit: number | null
  usageCount: number
  priority: number
  qualifiers: Array<{
    id: string
    productId: string
    variantId: string
    requiredQuantity: number
    productTitle: string
    variantTitle: string
    sku: string | null
    fulfillmentType: string
  }>
  rewards: Array<{
    id: string
    productId: string
    variantId: string
    rewardQuantity: number
    productTitle: string
    variantTitle: string
    sku: string | null
    fulfillmentType: string
  }>
  createdAt: Date
  updatedAt: Date
}

export function clampPromotionListPage(value: number) {
  return Math.max(1, Math.floor(Number(value || 1)))
}

export function clampPromotionListPageSize(value: number) {
  return Math.max(
    1,
    Math.min(MAX_PROMOTION_LIST_PAGE_SIZE, Math.floor(Number(value || DEFAULT_PROMOTION_LIST_PAGE_SIZE)))
  )
}

export function toPromotionListItemDto(promotion: PromotionListRecord): PromotionListItemDto {
  return {
    id: promotion.id,
    name: promotion.name,
    status: promotion.status,
    type: promotion.type,
    rewardType: promotion.rewardType,
    value: promotion.value,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    usageLimit: promotion.usageLimit,
    usageCount: promotion.usageCount,
    priority: promotion.priority,
    qualifierCount: promotion._count.qualifiers,
    rewardCount: promotion._count.rewards,
    updatedAt: promotion.updatedAt,
    createdAt: promotion.createdAt,
  }
}

export function toPromotionDetailDto(promotion: PromotionDetailRecord): PromotionDetailDto {
  return {
    id: promotion.id,
    name: promotion.name,
    status: promotion.status,
    type: promotion.type,
    rewardType: promotion.rewardType,
    value: promotion.value,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    usageLimit: promotion.usageLimit,
    usageCount: promotion.usageCount,
    priority: promotion.priority,
    qualifiers: promotion.qualifiers.map((qualifier) => ({
      id: qualifier.id,
      productId: qualifier.productId,
      variantId: qualifier.variantId,
      requiredQuantity: qualifier.requiredQuantity,
      productTitle: qualifier.product.title,
      variantTitle: qualifier.variant.title,
      sku: qualifier.variant.sku,
      fulfillmentType: qualifier.product.fulfillmentType,
    })),
    rewards: promotion.rewards.map((reward) => ({
      id: reward.id,
      productId: reward.productId,
      variantId: reward.variantId,
      rewardQuantity: reward.rewardQuantity,
      productTitle: reward.product.title,
      variantTitle: reward.variant.title,
      sku: reward.variant.sku,
      fulfillmentType: reward.product.fulfillmentType,
    })),
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  }
}

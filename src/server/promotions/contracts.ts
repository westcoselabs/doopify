export const PROMOTION_STATUSES = ['DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED'] as const
export const PROMOTION_TYPES = ['PRODUCT_GROUP_DISCOUNT', 'BUY_X_GET_Y', 'FREE_GIFT'] as const
export const PROMOTION_REWARD_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE'] as const
export const PROMOTION_FULFILLMENT_TYPES = ['PHYSICAL', 'DIGITAL'] as const

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number]
export type PromotionType = (typeof PROMOTION_TYPES)[number]
export type PromotionRewardType = (typeof PROMOTION_REWARD_TYPES)[number]
export type PromotionFulfillmentType = (typeof PROMOTION_FULFILLMENT_TYPES)[number]

export type PromotionQualifierDefinition = {
  productId?: string | null
  variantId: string
  requiredQuantity: number
}

export type PromotionRewardDefinition = {
  productId?: string | null
  variantId: string
  rewardQuantity: number
}

export type PromotionDefinition = {
  id: string
  name: string
  status: PromotionStatus
  type: PromotionType
  rewardType: PromotionRewardType
  value: number
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  usageLimit?: number | null
  usageCount: number
  priority: number
  qualifiers: PromotionQualifierDefinition[]
  rewards: PromotionRewardDefinition[]
}

export type PromotionCartLine = {
  variantId: string
  productId?: string | null
  quantity: number
  unitPriceCents: number
  fulfillmentType?: PromotionFulfillmentType | null
}

export type PromotionEvaluationInput = {
  cartLines: PromotionCartLine[]
  promotions: PromotionDefinition[]
  discountCode?: string | null
  now?: Date
  currency?: string
}

export type PromotionLineAllocation = {
  variantId: string
  quantity: number
  amountCents: number
}

export type PromotionApplicationDraft = {
  promotionId: string
  promotionName: string
  promotionType: PromotionType
  rewardType: PromotionRewardType
  amountCents: number
  lineAllocations: PromotionLineAllocation[]
  summary: string
}

export type PromotionEvaluationResult = {
  appliedPromotions: PromotionApplicationDraft[]
  totalDiscountCents: number
  skippedPromotionIds: string[]
  blockedByCodeDiscount: boolean
}

export type PromotionValidationIssue = {
  path: string
  code: string
  message: string
}

export type PromotionValidationResult = {
  ok: boolean
  errors: PromotionValidationIssue[]
  warnings: PromotionValidationIssue[]
}

export type PromotionDraftInput = {
  name: string
  status?: PromotionStatus
  type: PromotionType
  rewardType: PromotionRewardType
  value: number
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  usageLimit?: number | null
  priority?: number | null
  qualifiers: PromotionQualifierDefinition[]
  rewards?: PromotionRewardDefinition[]
}

export type PromotionVariantCatalogEntry = {
  variantId: string
  productId?: string | null
  fulfillmentType?: PromotionFulfillmentType | null
}

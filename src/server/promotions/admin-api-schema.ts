import { z } from 'zod'

const STATUSES = ['DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED'] as const
const TYPES = ['PRODUCT_GROUP_DISCOUNT', 'BUY_X_GET_Y', 'FREE_GIFT'] as const
const REWARD_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE'] as const
export const promotionStatusSchema = z.enum(STATUSES)
export const promotionTypeSchema = z.enum(TYPES)

const qualifierSchema = z.object({
  variantId: z.string(),
  requiredQuantity: z.number(),
  productId: z.string().optional(),
})

const rewardSchema = z.object({
  variantId: z.string(),
  rewardQuantity: z.number(),
  productId: z.string().optional(),
})

export const promotionCreateSchema = z.object({
  name: z.string(),
  status: promotionStatusSchema.optional(),
  type: promotionTypeSchema,
  rewardType: z.enum(REWARD_TYPES),
  value: z.number(),
  startsAt: z.union([z.string(), z.null()]).optional(),
  endsAt: z.union([z.string(), z.null()]).optional(),
  usageLimit: z.union([z.number(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  qualifiers: z.array(qualifierSchema),
  rewards: z.array(rewardSchema).optional(),
})

export const promotionPatchSchema = z.object({
  name: z.string().optional(),
  status: promotionStatusSchema.optional(),
  type: promotionTypeSchema.optional(),
  rewardType: z.enum(REWARD_TYPES).optional(),
  value: z.number().optional(),
  startsAt: z.union([z.string(), z.null()]).optional(),
  endsAt: z.union([z.string(), z.null()]).optional(),
  usageLimit: z.union([z.number(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  qualifiers: z.array(qualifierSchema).optional(),
  rewards: z.array(rewardSchema).optional(),
  usageCount: z.number().optional(),
})

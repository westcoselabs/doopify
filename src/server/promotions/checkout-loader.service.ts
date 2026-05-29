import { prisma } from '@/lib/prisma'
import type { PromotionDefinition } from '@/server/promotions/contracts'

export type CheckoutPromotionLoaderSkip = {
  promotionId: string
  promotionName: string
  reason:
    | 'EXPLICIT_PRODUCT_GROUP_REWARDS'
    | 'MISSING_QUALIFIERS'
    | 'MISSING_REWARDS'
    | 'NON_PHYSICAL_VARIANT'
  message: string
}

export type LoadCheckoutPromotionsResult = {
  promotions: PromotionDefinition[]
  skippedPromotions: CheckoutPromotionLoaderSkip[]
}

function requiresRewards(promotionType: PromotionDefinition['type']) {
  return promotionType === 'BUY_X_GET_Y' || promotionType === 'FREE_GIFT'
}

function isPhysicalFulfillment(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase() === 'PHYSICAL'
}

export async function loadAutomaticPromotionsForCheckout(): Promise<LoadCheckoutPromotionsResult> {
  const rows = await prisma.promotion.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'SCHEDULED'],
      },
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    include: {
      qualifiers: {
        select: {
          productId: true,
          variantId: true,
          requiredQuantity: true,
          variant: {
            select: {
              product: {
                select: {
                  fulfillmentType: true,
                },
              },
            },
          },
        },
      },
      rewards: {
        select: {
          productId: true,
          variantId: true,
          rewardQuantity: true,
          variant: {
            select: {
              product: {
                select: {
                  fulfillmentType: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const promotions: PromotionDefinition[] = []
  const skippedPromotions: CheckoutPromotionLoaderSkip[] = []

  for (const row of rows) {
    if (!row.qualifiers.length) {
      skippedPromotions.push({
        promotionId: row.id,
        promotionName: row.name,
        reason: 'MISSING_QUALIFIERS',
        message: 'Promotion requires at least one qualifier row.',
      })
      continue
    }

    if (requiresRewards(row.type) && row.rewards.length === 0) {
      skippedPromotions.push({
        promotionId: row.id,
        promotionName: row.name,
        reason: 'MISSING_REWARDS',
        message: 'Promotion requires reward rows in checkout V1.',
      })
      continue
    }

    if (row.type === 'PRODUCT_GROUP_DISCOUNT' && row.rewards.length > 0) {
      skippedPromotions.push({
        promotionId: row.id,
        promotionName: row.name,
        reason: 'EXPLICIT_PRODUCT_GROUP_REWARDS',
        message: 'PRODUCT_GROUP_DISCOUNT promotions with explicit rewards are skipped in checkout V1.',
      })
      continue
    }

    const fulfillmentRows = [...row.qualifiers, ...row.rewards]
    if (
      fulfillmentRows.some(
        (fulfillmentRow) => !isPhysicalFulfillment(fulfillmentRow.variant?.product?.fulfillmentType)
      )
    ) {
      skippedPromotions.push({
        promotionId: row.id,
        promotionName: row.name,
        reason: 'NON_PHYSICAL_VARIANT',
        message: 'Smart Promotions V1 only supports physical qualifier and reward variants.',
      })
      continue
    }

    promotions.push({
      id: row.id,
      name: row.name,
      status: row.status,
      type: row.type,
      rewardType: row.rewardType,
      value: row.value,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      usageLimit: row.usageLimit,
      usageCount: row.usageCount,
      priority: row.priority,
      qualifiers: row.qualifiers.map((qualifier) => ({
        productId: qualifier.productId,
        variantId: qualifier.variantId,
        requiredQuantity: qualifier.requiredQuantity,
      })),
      rewards: row.rewards.map((reward) => ({
        productId: reward.productId,
        variantId: reward.variantId,
        rewardQuantity: reward.rewardQuantity,
      })),
    })
  }

  return {
    promotions,
    skippedPromotions,
  }
}

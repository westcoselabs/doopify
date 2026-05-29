import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    promotion: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    promotion: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    promotionQualifier: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    promotionReward: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import {
  createPromotionFromAdmin,
  disablePromotionForAdmin,
  getPromotionForAdmin,
  listPromotionsForAdmin,
  updatePromotionFromAdmin,
  validatePromotionForAdmin,
} from '@/server/promotions/admin-service'

function buildVariantRow(input: {
  id: string
  productId: string
  productStatus?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  fulfillmentType?: 'PHYSICAL' | 'DIGITAL'
}) {
  return {
    id: input.id,
    title: `${input.id}-title`,
    productId: input.productId,
    product: {
      id: input.productId,
      title: `${input.productId}-title`,
      status: input.productStatus ?? 'ACTIVE',
      fulfillmentType: input.fulfillmentType ?? 'PHYSICAL',
    },
  }
}

function buildPromotionDetailRow() {
  return {
    id: 'promo_1',
    name: 'Promo One',
    status: 'ACTIVE',
    type: 'BUY_X_GET_Y',
    rewardType: 'PERCENTAGE',
    value: 20,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    priority: 10,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    qualifiers: [
      {
        id: 'qual_1',
        productId: 'prod_1',
        variantId: 'var_1',
        requiredQuantity: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        product: { id: 'prod_1', title: 'Product 1', fulfillmentType: 'PHYSICAL' },
        variant: { id: 'var_1', title: 'Variant 1', sku: 'SKU-1' },
      },
    ],
    rewards: [
      {
        id: 'rew_1',
        productId: 'prod_2',
        variantId: 'var_2',
        rewardQuantity: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        product: { id: 'prod_2', title: 'Product 2', fulfillmentType: 'PHYSICAL' },
        variant: { id: 'var_2', title: 'Variant 2', sku: 'SKU-2' },
      },
    ],
  }
}

describe('promotions admin service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx as never)
    )
  })

  it('lists promotion summaries with pagination', async () => {
    mocks.prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo_1',
        name: 'Promo One',
        status: 'ACTIVE',
        type: 'PRODUCT_GROUP_DISCOUNT',
        rewardType: 'PERCENTAGE',
        value: 10,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
        priority: 100,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        _count: {
          qualifiers: 1,
          rewards: 0,
        },
      },
    ])
    mocks.prisma.promotion.count.mockResolvedValue(1)

    const result = await listPromotionsForAdmin({
      page: 1,
      pageSize: 20,
      search: 'promo',
      status: 'ACTIVE',
      type: 'PRODUCT_GROUP_DISCOUNT',
    })

    expect(result.promotions).toHaveLength(1)
    expect(result.promotions[0]).toMatchObject({
      id: 'promo_1',
      qualifierCount: 1,
      rewardCount: 0,
    })
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
  })

  it('returns full detail DTO', async () => {
    mocks.prisma.promotion.findUnique.mockResolvedValue(buildPromotionDetailRow())

    const detail = await getPromotionForAdmin('promo_1')

    expect(detail).not.toBeNull()
    expect(detail?.qualifiers[0]).toMatchObject({
      variantId: 'var_1',
      productTitle: 'Product 1',
      fulfillmentType: 'PHYSICAL',
    })
    expect(detail?.rewards[0]).toMatchObject({
      variantId: 'var_2',
      rewardQuantity: 1,
    })
  })

  it('rejects product group discounts with explicit rewards', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([buildVariantRow({ id: 'var_1', productId: 'prod_1' })])

    const result = await validatePromotionForAdmin({
      name: 'Group with rewards',
      type: 'PRODUCT_GROUP_DISCOUNT',
      status: 'ACTIVE',
      rewardType: 'PERCENTAGE',
      value: 10,
      qualifiers: [{ variantId: 'var_1', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_1', rewardQuantity: 1 }],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PRODUCT_GROUP_REWARDS_NOT_ALLOWED',
        }),
      ])
    )
  })

  it('rejects unknown and digital variants in DB-backed validation', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      buildVariantRow({
        id: 'var_digital',
        productId: 'prod_2',
        fulfillmentType: 'DIGITAL',
      }),
    ])

    const result = await validatePromotionForAdmin({
      name: 'Digital reject',
      type: 'BUY_X_GET_Y',
      status: 'ACTIVE',
      rewardType: 'PERCENTAGE',
      value: 15,
      qualifiers: [{ variantId: 'var_missing', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_digital', rewardQuantity: 1 }],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
        expect.objectContaining({ code: 'DIGITAL_VARIANT_NOT_ALLOWED' }),
      ])
    )
  })

  it('enforces free gift reward contract and duplicate row guards', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      buildVariantRow({ id: 'var_1', productId: 'prod_1' }),
      buildVariantRow({ id: 'var_2', productId: 'prod_2' }),
    ])

    const freeGiftInvalidRewardType = await validatePromotionForAdmin({
      name: 'Gift',
      type: 'FREE_GIFT',
      status: 'ACTIVE',
      rewardType: 'PERCENTAGE',
      value: 10,
      qualifiers: [{ variantId: 'var_1', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_2', rewardQuantity: 1 }],
    })
    expect(freeGiftInvalidRewardType.ok).toBe(false)
    expect(freeGiftInvalidRewardType.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_REWARD_TYPE_FOR_PROMOTION_TYPE' }),
      ])
    )

    const freeGiftInvalidValue = await validatePromotionForAdmin({
      name: 'Gift',
      type: 'FREE_GIFT',
      status: 'ACTIVE',
      rewardType: 'FREE',
      value: 10,
      qualifiers: [{ variantId: 'var_1', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_2', rewardQuantity: 1 }],
    })
    expect(freeGiftInvalidValue.ok).toBe(false)
    expect(freeGiftInvalidValue.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INVALID_VALUE' })])
    )

    const duplicateRows = await validatePromotionForAdmin({
      name: 'Dupes',
      type: 'BUY_X_GET_Y',
      status: 'ACTIVE',
      rewardType: 'PERCENTAGE',
      value: 10,
      qualifiers: [
        { variantId: 'var_1', requiredQuantity: 1 },
        { variantId: 'var_1', requiredQuantity: 2 },
      ],
      rewards: [
        { variantId: 'var_2', rewardQuantity: 1 },
        { variantId: 'var_2', rewardQuantity: 1 },
      ],
    })
    expect(duplicateRows.ok).toBe(false)
    expect(duplicateRows.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_VARIANT' })])
    )
  })

  it('rejects same variant in qualifier and reward for buy x get y', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([buildVariantRow({ id: 'var_1', productId: 'prod_1' })])

    const result = await validatePromotionForAdmin({
      name: 'Ambiguous',
      type: 'BUY_X_GET_Y',
      status: 'ACTIVE',
      rewardType: 'PERCENTAGE',
      value: 15,
      qualifiers: [{ variantId: 'var_1', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_1', rewardQuantity: 1 }],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'AMBIGUOUS_VARIANT_ROLE' })])
    )
  })

  it('creates buy x get y promotion with DB-derived product ids', async () => {
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      buildVariantRow({ id: 'var_1', productId: 'prod_1' }),
      buildVariantRow({ id: 'var_2', productId: 'prod_2' }),
    ])
    mocks.tx.promotion.create.mockResolvedValue({ id: 'promo_new' })
    mocks.tx.promotion.findUnique.mockResolvedValue(buildPromotionDetailRow())

    const result = await createPromotionFromAdmin({
      name: 'Buy X Get Y',
      status: 'ACTIVE',
      type: 'BUY_X_GET_Y',
      rewardType: 'PERCENTAGE',
      value: 25,
      qualifiers: [{ variantId: 'var_1', requiredQuantity: 2 }],
      rewards: [{ variantId: 'var_2', rewardQuantity: 1 }],
    })

    expect(result.ok).toBe(true)
    expect(mocks.tx.promotion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qualifiers: {
            create: [
              expect.objectContaining({
                productId: 'prod_1',
                variantId: 'var_1',
              }),
            ],
          },
          rewards: {
            create: [
              expect.objectContaining({
                productId: 'prod_2',
                variantId: 'var_2',
              }),
            ],
          },
        }),
      })
    )
  })

  it('preserves omitted rows on patch and rejects usageCount edits', async () => {
    const immutableResult = await updatePromotionFromAdmin('promo_1', { usageCount: 99 })
    expect(immutableResult.ok).toBe(false)
    if (immutableResult.ok) {
      throw new Error('expected immutable usageCount patch to fail')
    }
    expect(immutableResult.errors[0].code).toBe('IMMUTABLE_FIELD')

    mocks.prisma.promotion.findUnique.mockResolvedValue(buildPromotionDetailRow())
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      buildVariantRow({ id: 'var_1', productId: 'prod_1' }),
      buildVariantRow({ id: 'var_2', productId: 'prod_2' }),
    ])
    mocks.tx.promotion.update.mockResolvedValue({ id: 'promo_1' })
    mocks.tx.promotion.findUnique.mockResolvedValue(buildPromotionDetailRow())

    const patchResult = await updatePromotionFromAdmin('promo_1', {
      name: 'Renamed Promo',
    })

    expect(patchResult.ok).toBe(true)
    expect(mocks.tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'promo_1' },
        data: expect.objectContaining({
          name: 'Renamed Promo',
          type: 'BUY_X_GET_Y',
        }),
      })
    )
    expect(mocks.tx.promotionQualifier.deleteMany).not.toHaveBeenCalled()
    expect(mocks.tx.promotionReward.deleteMany).not.toHaveBeenCalled()
  })

  it('replaces qualifier/reward rows on patch with product ids from variant lookup', async () => {
    mocks.prisma.promotion.findUnique.mockResolvedValue(buildPromotionDetailRow())
    mocks.prisma.productVariant.findMany.mockResolvedValue([
      buildVariantRow({ id: 'var_3', productId: 'prod_3' }),
      buildVariantRow({ id: 'var_4', productId: 'prod_4' }),
    ])
    mocks.tx.promotion.update.mockResolvedValue({ id: 'promo_1' })
    mocks.tx.promotion.findUnique.mockResolvedValue({
      ...buildPromotionDetailRow(),
      qualifiers: [
        {
          id: 'qual_2',
          productId: 'prod_3',
          variantId: 'var_3',
          requiredQuantity: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          product: { id: 'prod_3', title: 'Product 3', fulfillmentType: 'PHYSICAL' },
          variant: { id: 'var_3', title: 'Variant 3', sku: 'SKU-3' },
        },
      ],
      rewards: [
        {
          id: 'rew_2',
          productId: 'prod_4',
          variantId: 'var_4',
          rewardQuantity: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          product: { id: 'prod_4', title: 'Product 4', fulfillmentType: 'PHYSICAL' },
          variant: { id: 'var_4', title: 'Variant 4', sku: 'SKU-4' },
        },
      ],
    })

    const result = await updatePromotionFromAdmin('promo_1', {
      qualifiers: [{ variantId: 'var_3', requiredQuantity: 1 }],
      rewards: [{ variantId: 'var_4', rewardQuantity: 1 }],
    })

    expect(result.ok).toBe(true)
    expect(mocks.tx.promotionQualifier.deleteMany).toHaveBeenCalledWith({
      where: { promotionId: 'promo_1' },
    })
    expect(mocks.tx.promotionQualifier.createMany).toHaveBeenCalledWith({
      data: [
        {
          promotionId: 'promo_1',
          productId: 'prod_3',
          variantId: 'var_3',
          requiredQuantity: 1,
        },
      ],
    })
    expect(mocks.tx.promotionReward.createMany).toHaveBeenCalledWith({
      data: [
        {
          promotionId: 'promo_1',
          productId: 'prod_4',
          variantId: 'var_4',
          rewardQuantity: 1,
        },
      ],
    })
  })

  it('soft-disables promotions', async () => {
    mocks.prisma.promotion.updateMany.mockResolvedValue({ count: 1 })

    const result = await disablePromotionForAdmin('promo_1')

    expect(result).toEqual({ id: 'promo_1', status: 'DISABLED' })
    expect(mocks.prisma.promotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'promo_1' },
      data: { status: 'DISABLED' },
    })
  })
})

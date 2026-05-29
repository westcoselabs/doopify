import { Prisma, type FulfillmentStatus, type OrderStatus, type PaymentStatus } from '@prisma/client'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import type { CheckoutAppliedDiscount } from '@/server/checkout/pricing'
import { emitInternalEvent } from '@/server/events/dispatcher'
import { resolveOrderFulfillmentSnapshot } from '@/server/services/fulfillment-status.service'
import type { PromotionRewardType, PromotionType } from '@/server/promotions/contracts'

const DEFAULT_ORDER_LIST_PAGE_SIZE = 20
const MAX_ORDER_LIST_PAGE_SIZE = 100

const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  channel: true,
  email: true,
  currency: true,
  totalCents: true,
  subtotalCents: true,
  shippingAmountCents: true,
  taxAmountCents: true,
  discountAmountCents: true,
  note: true,
  tags: true,
  createdAt: true,
  customer: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  items: {
    select: {
      id: true,
      quantity: true,
      title: true,
      variantTitle: true,
      priceCents: true,
    },
  },
  addresses: {
    select: {
      id: true,
      type: true,
      address1: true,
      city: true,
      province: true,
    },
  },
  payments: {
    select: {
      id: true,
      provider: true,
      status: true,
      amountCents: true,
      currency: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      createdAt: true,
    },
  },
  fulfillments: {
    select: {
      status: true,
      deliveredAt: true,
      trackingNumber: true,
      carrier: true,
      items: {
        select: {
          orderItemId: true,
          quantity: true,
        },
      },
    },
  },
  returns: {
    select: {
      status: true,
    },
    orderBy: {
      createdAt: 'desc' as const,
    },
    take: 1,
  },
} satisfies Prisma.OrderSelect

const orderPaymentActivitySelect = {
  id: true,
  orderNumber: true,
  currency: true,
  createdAt: true,
  payments: {
    select: {
      id: true,
      provider: true,
      status: true,
      amountCents: true,
      currency: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderSelect

function clampPage(value?: number) {
  return Math.max(1, Math.floor(Number(value || 1)))
}

function clampOrderListPageSize(value?: number) {
  return Math.max(1, Math.min(MAX_ORDER_LIST_PAGE_SIZE, Math.floor(Number(value || DEFAULT_ORDER_LIST_PAGE_SIZE))))
}

function parseOrderNumberSearch(search?: string) {
  const query = search?.trim()
  if (!query || !/^\d+$/.test(query)) {
    return undefined
  }

  const value = Number(query)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function buildOrderTotals(input: {
  items: Array<{ priceCents: number; quantity: number }>
  taxAmountCents?: number
  shippingAmountCents?: number
  shippingMethodName?: string | null
  shippingRateType?: string | null
  shippingProvider?: string | null
  shippingProviderRateId?: string | null
  estimatedDeliveryText?: string | null
  discountAmountCents?: number
}) {
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + Math.round(Number(item.priceCents)) * Number(item.quantity),
    0
  )
  const taxAmountCents = Math.round(input.taxAmountCents ?? 0)
  const shippingAmountCents = Math.round(input.shippingAmountCents ?? 0)
  const discountAmountCents = Math.round(input.discountAmountCents ?? 0)
  const totalCents = subtotalCents + taxAmountCents + shippingAmountCents - discountAmountCents

  return {
    subtotalCents,
    taxAmountCents,
    shippingAmountCents,
    discountAmountCents,
    totalCents,
  }
}

async function incrementDiscountUsageWithCap(input: {
  tx: Prisma.TransactionClient
  discountId: string
}) {
  const discount = await input.tx.discount.findUnique({
    where: { id: input.discountId },
    select: {
      id: true,
      usageCount: true,
      usageLimit: true,
    },
  })

  if (!discount) {
    throw new Error(`Discount ${input.discountId} could not be found`)
  }

  if (discount.usageLimit == null) {
    await input.tx.discount.update({
      where: { id: input.discountId },
      data: { usageCount: { increment: 1 } },
    })
    return
  }

  if (discount.usageCount >= discount.usageLimit) {
    throw new Error(`Discount usage limit reached for ${input.discountId}`)
  }

  const updated = await input.tx.discount.updateMany({
    where: {
      id: input.discountId,
      usageCount: discount.usageCount,
      usageLimit: discount.usageLimit,
    },
    data: { usageCount: { increment: 1 } },
  })

  if (updated.count === 0) {
    throw new Error(`Discount usage limit reached for ${input.discountId}`)
  }
}

type OrderPromotionLineAllocationInput = {
  variantId: string
  orderItemId?: string | null
  quantityDiscounted: number
  discountCents: number
}

type OrderPromotionApplicationInput = {
  promotionId?: string | null
  promotionName: string
  promotionType: PromotionType
  rewardType: PromotionRewardType
  amountCents: number
  lineAllocations?: OrderPromotionLineAllocationInput[]
}

function normalizeNonNegativeInt(value: number | null | undefined) {
  return Math.max(0, Math.round(Number(value || 0)))
}

function splitDiscountAcrossSegments(input: {
  totalDiscountCents: number
  segments: Array<{ orderItemId: string; variantId: string; quantity: number }>
}) {
  const totalQuantity = input.segments.reduce((sum, segment) => sum + segment.quantity, 0)
  if (totalQuantity <= 0 || input.totalDiscountCents <= 0) {
    return [] as Array<{ orderItemId: string; variantId: string; quantityDiscounted: number; discountCents: number }>
  }

  const weighted = input.segments.map((segment) => {
    const raw = (input.totalDiscountCents * segment.quantity) / totalQuantity
    const floor = Math.floor(raw)
    return {
      segment,
      floor,
      fraction: raw - floor,
    }
  })

  const flooredTotal = weighted.reduce((sum, entry) => sum + entry.floor, 0)
  let remainder = input.totalDiscountCents - flooredTotal

  const ranked = [...weighted].sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction
    if (b.segment.quantity !== a.segment.quantity) return b.segment.quantity - a.segment.quantity
    return a.segment.orderItemId.localeCompare(b.segment.orderItemId)
  })

  const amountByOrderItem = new Map<string, number>()
  for (const entry of weighted) {
    amountByOrderItem.set(entry.segment.orderItemId, entry.floor)
  }
  for (const entry of ranked) {
    if (remainder <= 0) break
    amountByOrderItem.set(entry.segment.orderItemId, (amountByOrderItem.get(entry.segment.orderItemId) ?? 0) + 1)
    remainder -= 1
  }

  return weighted
    .map((entry) => {
      const discountCents = Math.max(0, amountByOrderItem.get(entry.segment.orderItemId) ?? 0)
      if (discountCents <= 0) return null
      return {
        orderItemId: entry.segment.orderItemId,
        variantId: entry.segment.variantId,
        quantityDiscounted: entry.segment.quantity,
        discountCents,
      }
    })
    .filter((entry): entry is { orderItemId: string; variantId: string; quantityDiscounted: number; discountCents: number } => entry != null)
}

function allocatePromotionLineForOrderItems(input: {
  allocation: OrderPromotionLineAllocationInput
  orderItemsByVariant: Map<string, Array<{ id: string; quantity: number }>>
}) {
  const variantId = String(input.allocation.variantId || '').trim()
  const quantityDiscounted = normalizeNonNegativeInt(input.allocation.quantityDiscounted)
  const discountCents = normalizeNonNegativeInt(input.allocation.discountCents)

  if (!variantId || quantityDiscounted <= 0 || discountCents <= 0) {
    return [] as Array<{
      orderItemId: string | null
      variantId: string
      quantityDiscounted: number
      discountCents: number
    }>
  }

  const orderItemId = String(input.allocation.orderItemId || '').trim() || null
  if (orderItemId) {
    return [
      {
        orderItemId,
        variantId,
        quantityDiscounted,
        discountCents,
      },
    ]
  }

  const matches = input.orderItemsByVariant.get(variantId) ?? []
  if (!matches.length) {
    return [
      {
        orderItemId: null,
        variantId,
        quantityDiscounted,
        discountCents,
      },
    ]
  }

  let remainingQuantity = quantityDiscounted
  const segments: Array<{ orderItemId: string; variantId: string; quantity: number }> = []

  for (const match of matches) {
    if (remainingQuantity <= 0) break
    const quantityForItem = Math.min(match.quantity, remainingQuantity)
    if (quantityForItem <= 0) continue
    segments.push({
      orderItemId: match.id,
      variantId,
      quantity: quantityForItem,
    })
    remainingQuantity -= quantityForItem
  }

  if (!segments.length) {
    return [
      {
        orderItemId: null,
        variantId,
        quantityDiscounted,
        discountCents,
      },
    ]
  }

  const allocated = splitDiscountAcrossSegments({
    totalDiscountCents: discountCents,
    segments,
  })

  if (!allocated.length) {
    return [
      {
        orderItemId: null,
        variantId,
        quantityDiscounted,
        discountCents,
      },
    ]
  }

  return allocated.map((entry) => ({
    orderItemId: entry.orderItemId,
    variantId: entry.variantId,
    quantityDiscounted: entry.quantityDiscounted,
    discountCents: entry.discountCents,
  }))
}

async function incrementPromotionUsageAfterPaid(input: {
  tx: Prisma.TransactionClient
  promotionId: string
}) {
  const promotion = await input.tx.promotion.findUnique({
    where: { id: input.promotionId },
    select: {
      id: true,
      usageLimit: true,
    },
  })

  if (!promotion) return

  if (promotion.usageLimit == null) {
    await input.tx.promotion.update({
      where: { id: input.promotionId },
      data: { usageCount: { increment: 1 } },
    })
    return
  }

  await input.tx.promotion.updateMany({
    where: {
      id: input.promotionId,
      usageCount: { lt: promotion.usageLimit },
    },
    data: { usageCount: { increment: 1 } },
  })
}

export async function getOrders(params: {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  fulfillmentStatus?: FulfillmentStatus
  search?: string
  page?: number
  pageSize?: number
  view?: 'payments_activity'
}) {
  const { status, paymentStatus, fulfillmentStatus, search } = params
  const page = clampPage(params.page)
  const pageSize = clampOrderListPageSize(params.pageSize)
  const view = params.view
  const orderNumber = parseOrderNumberSearch(search)
  const trimmedSearch = search?.trim()

  const where: Prisma.OrderWhereInput = {
    ...(status && { status }),
    ...(paymentStatus && { paymentStatus }),
    ...(fulfillmentStatus && { fulfillmentStatus }),
    ...(trimmedSearch && {
      OR: [
        { email: { contains: trimmedSearch, mode: 'insensitive' } },
        { customer: { email: { contains: trimmedSearch, mode: 'insensitive' } } },
        { customer: { firstName: { contains: trimmedSearch, mode: 'insensitive' } } },
        ...(orderNumber ? [{ orderNumber: { equals: orderNumber } }] : []),
      ],
    }),
  }

  if (view === 'payments_activity') {
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: orderPaymentActivitySelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ])

    return {
      orders,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: orderListSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ])

  const normalizedOrders = orders.map((order) => {
    const derived = resolveOrderFulfillmentSnapshot({
      orderItems: order.items.map((item) => ({ id: item.id, quantity: item.quantity })),
      fulfillmentRows: order.fulfillments.map((fulfillment) => ({
        status: fulfillment.status,
        deliveredAt: fulfillment.deliveredAt,
        items: fulfillment.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      })),
    })

    return {
      ...order,
      fulfillmentStatus: derived.fulfillmentStatus,
      fulfillmentStatusDerived: derived.fulfillmentStatus,
      shippingStatusDerived: derived.shippingStatus,
    }
  })

  return {
    orders: normalizedOrders,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getOrder(orderNumber: number) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: {
      customer: { include: { addresses: true } },
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
      addresses: true,
      payments: true,
      fulfillments: { include: { items: true } },
      events: { orderBy: { createdAt: 'desc' } },
      refunds: { include: { items: true }, orderBy: { createdAt: 'desc' } },
      returns: {
        include: {
          items: true,
          refund: { select: { id: true, amountCents: true, status: true, stripeRefundId: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      discountApplications: { include: { discount: true } },
      promotionApplications: {
        include: {
          lines: true,
        },
      },
    },
  })
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      addresses: true,
      payments: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
}

export async function getOrderByPaymentIntentId(paymentIntentId: string) {
  return prisma.order.findFirst({
    where: {
      payments: {
        some: {
          stripePaymentIntentId: paymentIntentId,
        },
      },
    },
    include: {
      items: true,
      addresses: true,
      payments: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
}

export async function createOrder(data: {
  customerId?: string
  email?: string
  items: Array<{
    productId?: string
    variantId?: string
    title: string
    variantTitle?: string
    sku?: string
    priceCents: number
    quantity: number
  }>
  shippingAddress?: {
    firstName?: string
    lastName?: string
    company?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    postalCode?: string
    country?: string
    phone?: string
  }
  billingAddress?: {
    firstName?: string
    lastName?: string
    company?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    postalCode?: string
    country?: string
    phone?: string
  }
  taxAmountCents?: number
  shippingAmountCents?: number
  shippingMethodName?: string | null
  shippingRateType?: string | null
  shippingProvider?: string | null
  shippingProviderRateId?: string | null
  estimatedDeliveryText?: string | null
  discountAmountCents?: number
  currency?: string
  discountApplications?: CheckoutAppliedDiscount[]
  promotionApplications?: OrderPromotionApplicationInput[]
  stripePaymentIntentId?: string
  stripeChargeId?: string
  paymentStatus?: PaymentStatus
  decrementInventory?: boolean
  fulfillmentStatus?: FulfillmentStatus
  status?: OrderStatus
}) {
  if (!data.items.length) {
    throw new Error('Cannot create an order without line items')
  }

  if (data.stripePaymentIntentId) {
    const existingOrder = await getOrderByPaymentIntentId(data.stripePaymentIntentId)
    if (existingOrder) {
      return existingOrder
    }
  }

  const totals = buildOrderTotals({
    items: data.items,
    taxAmountCents: data.taxAmountCents,
    shippingAmountCents: data.shippingAmountCents,
    discountAmountCents: data.discountAmountCents,
  })

  const paymentStatus = data.paymentStatus ?? 'PAID'
  const shouldDecrementInventory = data.decrementInventory ?? paymentStatus === 'PAID'
  const fulfillmentStatus = data.fulfillmentStatus ?? 'UNFULFILLED'
  const orderStatus = data.status ?? 'OPEN'
  const discountApplications = data.discountApplications ?? []
  const paidDiscountApplications = paymentStatus === 'PAID' ? discountApplications : []
  const promotionApplications = data.promotionApplications ?? []
  const paidPromotionApplications = paymentStatus === 'PAID' ? promotionApplications : []

  try {
    const order = await prisma.$transaction(async (tx) => {
      if (shouldDecrementInventory) {
        for (const item of data.items) {
          if (!item.variantId) continue

          const updated = await tx.productVariant.updateMany({
            where: {
              id: item.variantId,
              OR: [{ continueSellingWhenOutOfStock: true }, { inventory: { gte: item.quantity } }],
            },
            data: { inventory: { decrement: item.quantity } },
          })

          if (updated.count === 0) {
            throw new Error(`Insufficient inventory for variant ${item.variantId}`)
          }
        }
      }

      const createdOrder = await tx.order.create({
        data: {
          customerId: data.customerId,
          email: data.email,
          status: orderStatus,
          paymentStatus,
          fulfillmentStatus,
          subtotalCents: totals.subtotalCents,
          taxAmountCents: totals.taxAmountCents,
          shippingAmountCents: totals.shippingAmountCents,
          shippingMethodName: data.shippingMethodName,
          shippingRateType: data.shippingRateType,
          shippingProvider: data.shippingProvider,
          shippingProviderRateId: data.shippingProviderRateId,
          estimatedDeliveryText: data.estimatedDeliveryText,
          discountAmountCents: totals.discountAmountCents,
          totalCents: totals.totalCents,
          currency: (data.currency ?? 'USD').toUpperCase(),
          channel: 'online',
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              title: item.title,
              variantTitle: item.variantTitle,
              sku: item.sku,
              priceCents: item.priceCents,
              quantity: item.quantity,
              totalCents: item.priceCents * item.quantity,
            })),
          },
          addresses:
            data.shippingAddress || data.billingAddress
              ? {
                  create: [
                    ...(data.shippingAddress
                      ? [
                          {
                            type: 'SHIPPING' as const,
                            ...data.shippingAddress,
                          },
                        ]
                      : []),
                    ...(data.billingAddress
                      ? [
                          {
                            type: 'BILLING' as const,
                            ...data.billingAddress,
                          },
                        ]
                      : []),
                  ],
                }
              : undefined,
          payments: data.stripePaymentIntentId
            ? {
                create: {
                  provider: 'stripe',
                  amountCents: totals.totalCents,
                  currency: (data.currency ?? 'USD').toUpperCase(),
                  status: paymentStatus,
                  stripePaymentIntentId: data.stripePaymentIntentId,
                  stripeChargeId: data.stripeChargeId,
                },
              }
            : undefined,
          discountApplications: paidDiscountApplications.length
            ? {
                create: paidDiscountApplications.map((discount) => ({
                  discountId: discount.discountId,
                  amountCents: discount.amountCents ?? 0,
                })),
              }
            : undefined,
          events: {
            create: [
              {
                type: 'ORDER_PLACED',
                title: 'Order placed',
                detail: 'Order was created via online checkout',
                actorType: 'SYSTEM',
              },
              ...(paymentStatus === 'PAID'
                ? [
                    {
                      type: 'PAYMENT_RECEIVED',
                      title: 'Payment received',
                      detail: data.stripePaymentIntentId
                        ? `Stripe payment intent ${data.stripePaymentIntentId} succeeded`
                        : 'Payment received',
                      actorType: 'SYSTEM' as const,
                    },
                  ]
                : []),
            ],
          },
        },
        include: {
          items: true,
          addresses: true,
          payments: true,
          events: true,
        },
      })

      if (data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            orderCount: { increment: 1 },
            ...(paymentStatus === 'PAID'
              ? {
                  totalSpentCents: { increment: totals.totalCents },
                }
              : {}),
          },
        })
      }

      if (paymentStatus === 'PAID') {
        for (const discount of paidDiscountApplications) {
          await incrementDiscountUsageWithCap({
            tx,
            discountId: discount.discountId,
          })
        }

        if (paidPromotionApplications.length) {
          const requestedPromotionIds = Array.from(
            new Set(
              paidPromotionApplications
                .map((promotion) => String(promotion.promotionId || '').trim())
                .filter(Boolean)
            )
          )
          const existingPromotionIds = new Set(
            (
              requestedPromotionIds.length
                ? await tx.promotion.findMany({
                    where: {
                      id: {
                        in: requestedPromotionIds,
                      },
                    },
                    select: {
                      id: true,
                    },
                  })
                : []
            ).map((promotion) => promotion.id)
          )
          const orderItemsByVariant = new Map<string, Array<{ id: string; quantity: number }>>()
          for (const item of createdOrder.items) {
            const variantId = String(item.variantId || '').trim()
            if (!variantId) continue
            const existing = orderItemsByVariant.get(variantId) ?? []
            existing.push({ id: item.id, quantity: Number(item.quantity || 0) })
            orderItemsByVariant.set(variantId, existing)
          }

          const promotionIdsToIncrement = new Set<string>()

          for (const promotion of paidPromotionApplications) {
            const rawPromotionId = String(promotion.promotionId || '').trim()
            const promotionId = rawPromotionId && existingPromotionIds.has(rawPromotionId) ? rawPromotionId : null
            const createdPromotionApplication = await tx.promotionApplication.create({
              data: {
                orderId: createdOrder.id,
                promotionId,
                nameSnapshot: String(promotion.promotionName || '').trim() || 'Promotion',
                typeSnapshot: promotion.promotionType,
                rewardTypeSnapshot: promotion.rewardType,
                amountCents: normalizeNonNegativeInt(promotion.amountCents),
              },
            })

            const rawAllocations = promotion.lineAllocations ?? []
            const normalizedLineRows = rawAllocations.flatMap((allocation) =>
              allocatePromotionLineForOrderItems({
                allocation,
                orderItemsByVariant,
              })
            )

            if (normalizedLineRows.length) {
              await tx.promotionApplicationLine.createMany({
                data: normalizedLineRows.map((line) => ({
                  promotionApplicationId: createdPromotionApplication.id,
                  orderItemId: line.orderItemId,
                  variantId: line.variantId,
                  quantityDiscounted: normalizeNonNegativeInt(line.quantityDiscounted),
                  discountCents: normalizeNonNegativeInt(line.discountCents),
                })),
              })

              const discountByOrderItemId = new Map<string, number>()
              for (const line of normalizedLineRows) {
                if (!line.orderItemId) continue
                discountByOrderItemId.set(
                  line.orderItemId,
                  (discountByOrderItemId.get(line.orderItemId) ?? 0) + normalizeNonNegativeInt(line.discountCents)
                )
              }

              for (const [orderItemId, discountCents] of discountByOrderItemId.entries()) {
                if (discountCents <= 0) continue
                await tx.orderItem.updateMany({
                  where: {
                    id: orderItemId,
                    orderId: createdOrder.id,
                  },
                  data: {
                    totalDiscountCents: { increment: discountCents },
                  },
                })
              }
            }

            if (promotionId) {
              promotionIdsToIncrement.add(promotionId)
            }
          }

          for (const promotionId of promotionIdsToIncrement) {
            await incrementPromotionUsageAfterPaid({
              tx,
              promotionId,
            })
          }
        }
      }

      return createdOrder
    })

    await emitInternalEvent('order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      total: centsToDollars(order.totalCents),
      currency: order.currency,
    })

    if (order.paymentStatus === 'PAID') {
      const shippingAddress = order.addresses.find((address) => address.type === 'SHIPPING')

      await emitInternalEvent('order.paid', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        email: order.email,
        total: centsToDollars(order.totalCents),
        currency: order.currency,
        items: order.items.map((item) => ({
          title: item.title,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          price: centsToDollars(item.priceCents),
        })),
        shippingAddress: shippingAddress
          ? {
              firstName: shippingAddress.firstName,
              lastName: shippingAddress.lastName,
              address1: shippingAddress.address1,
              city: shippingAddress.city,
              province: shippingAddress.province,
              postalCode: shippingAddress.postalCode,
              country: shippingAddress.country,
            }
          : undefined,
      })
    }

    return order
  } catch (error) {
    if (data.stripePaymentIntentId) {
      const existingOrder = await getOrderByPaymentIntentId(data.stripePaymentIntentId)
      if (existingOrder) {
        return existingOrder
      }
    }

    throw error
  }
}

export async function createOrderEvent(
  orderId: string,
  data: { type: string; title: string; detail?: string; actorType?: 'SYSTEM' | 'STAFF' | 'CUSTOMER'; actorId?: string }
) {
  return prisma.orderEvent.create({
    data: {
      orderId,
      type: data.type,
      title: data.title,
      detail: data.detail,
      actorType: data.actorType ?? 'SYSTEM',
      actorId: data.actorId,
    },
  })
}

export async function updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: {
      items: true,
      addresses: true,
    },
  })

  await createOrderEvent(orderId, {
    type: 'PAYMENT_STATUS_UPDATED',
    title: `Payment status updated to ${paymentStatus}`,
    actorType: 'STAFF',
  })

  if (paymentStatus === 'PAID') {
    const shippingAddress = order.addresses.find((address) => address.type === 'SHIPPING')

    await emitInternalEvent('order.paid', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      total: centsToDollars(order.totalCents),
      currency: order.currency,
      items: order.items.map((item) => ({
        title: item.title,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        price: centsToDollars(item.priceCents),
      })),
      shippingAddress: shippingAddress
        ? {
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            address1: shippingAddress.address1,
            city: shippingAddress.city,
            province: shippingAddress.province,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
          }
        : undefined,
    })
  }

  return order
}

export async function updateFulfillmentStatus(orderId: string, fulfillmentStatus: FulfillmentStatus) {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { fulfillmentStatus },
  })

  await createOrderEvent(orderId, {
    type: 'FULFILLMENT_STATUS_UPDATED',
    title: `Fulfillment status updated to ${fulfillmentStatus}`,
    actorType: 'STAFF',
  })

  return order
}

export async function createFulfillment(data: {
  orderId: string
  items: Array<{ orderItemId: string; variantId?: string; quantity: number }>
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
}) {
  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          quantity: true,
        },
      },
      fulfillments: {
        select: {
          status: true,
          items: {
            select: {
              orderItemId: true,
              quantity: true,
            },
          },
        },
      },
    },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  const nextFulfillmentStatus = resolveOrderFulfillmentSnapshot({
    orderItems: order.items,
    fulfillmentRows: [
      ...order.fulfillments,
      {
        status: 'SUCCESS',
        deliveredAt: null,
        items: data.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
    ],
  }).fulfillmentStatus

  const fulfillment = await prisma.$transaction(async (tx) => {
    const createdFulfillment = await tx.fulfillment.create({
      data: {
        orderId: data.orderId,
        status: 'SUCCESS',
        carrier: data.carrier,
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        shippedAt: new Date(),
        items: {
          create: data.items.map((item) => ({
            orderItemId: item.orderItemId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    })

    await tx.order.update({
      where: { id: data.orderId },
      data: { fulfillmentStatus: nextFulfillmentStatus },
    })

    await tx.orderEvent.create({
      data: {
        orderId: data.orderId,
        type: 'FULFILLMENT_CREATED',
        title: data.trackingNumber
          ? `Fulfillment created with tracking ${data.trackingNumber}`
          : 'Fulfillment created',
        actorType: 'STAFF',
      },
    })

    return createdFulfillment
  })

  await emitInternalEvent('fulfillment.created', {
    fulfillmentId: fulfillment.id,
    orderId: data.orderId,
    trackingNumber: data.trackingNumber,
    sendTrackingEmail: Boolean(data.trackingNumber || data.trackingUrl),
  })

  return fulfillment
}

type ManualFulfillmentItemInput = {
  orderItemId: string
  variantId?: string
  quantity: number
}

export async function createManualFulfillment(data: {
  orderId: string
  items: ManualFulfillmentItemInput[]
  carrier?: string
  service?: string
  trackingNumber?: string
  trackingUrl?: string
  shippedAt?: Date
  sendTrackingEmail?: boolean
}) {
  if (!data.items.length) {
    throw new Error('At least one fulfillment item is required')
  }

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: {
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
        },
      },
      fulfillments: {
        select: {
          status: true,
          items: {
            select: {
              orderItemId: true,
              quantity: true,
            },
          },
        },
      },
    },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
    throw new Error('Manual fulfillment is only available for paid orders')
  }

  const orderItemById = new Map(order.items.map((item) => [item.id, item]))
  const { fulfilledByOrderItemId } = resolveOrderFulfillmentSnapshot({
    orderItems: order.items,
    fulfillmentRows: order.fulfillments,
  })

  for (const item of data.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Fulfillment item quantity must be a positive integer')
    }

    const orderItem = orderItemById.get(item.orderItemId)
    if (!orderItem) {
      throw new Error('Fulfillment item does not belong to this order')
    }

    const alreadyFulfilled = fulfilledByOrderItemId.get(item.orderItemId) ?? 0
    const remainingQuantity = Number(orderItem.quantity) - alreadyFulfilled

    if (item.quantity > remainingQuantity) {
      throw new Error(
        `Cannot fulfill ${item.quantity} unit(s) for item ${item.orderItemId}. Remaining fulfillable quantity is ${remainingQuantity}.`
      )
    }

    if (item.variantId && orderItem.variantId && item.variantId !== orderItem.variantId) {
      throw new Error('Fulfillment item variant does not match this order item')
    }

    fulfilledByOrderItemId.set(item.orderItemId, alreadyFulfilled + item.quantity)
  }

  const nextFulfillmentStatus = resolveOrderFulfillmentSnapshot({
    orderItems: order.items,
    fulfillmentRows: [
      ...order.fulfillments,
      {
        status: 'SUCCESS',
        deliveredAt: null,
        items: data.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
    ],
  }).fulfillmentStatus

  const fulfillment = await prisma.$transaction(async (tx) => {
    const createdFulfillment = await tx.fulfillment.create({
      data: {
        orderId: data.orderId,
        status: 'SUCCESS',
        carrier: data.carrier,
        service: data.service,
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        shippedAt: data.shippedAt ?? new Date(),
        items: {
          create: data.items.map((item) => ({
            orderItemId: item.orderItemId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    await tx.order.update({
      where: { id: data.orderId },
      data: {
        fulfillmentStatus: nextFulfillmentStatus,
      },
    })

    const timelineEvents = []
    if (data.trackingNumber || data.trackingUrl) {
      timelineEvents.push({
        orderId: data.orderId,
        type: 'TRACKING_ADDED',
        title: 'Tracking added',
        detail: data.trackingNumber
          ? `Tracking number ${data.trackingNumber} was added manually.`
          : 'Tracking details were added manually.',
        actorType: 'STAFF' as const,
      })
    }
    if (nextFulfillmentStatus !== 'UNFULFILLED') {
      timelineEvents.push({
        orderId: data.orderId,
        type: 'ORDER_MARKED_SHIPPED',
        title: 'Order marked shipped',
        detail:
          nextFulfillmentStatus === 'PARTIALLY_FULFILLED'
            ? 'A partial shipment was created.'
            : 'All items are now marked as shipped.',
        actorType: 'STAFF' as const,
      })
    }
    if (data.sendTrackingEmail) {
      timelineEvents.push({
        orderId: data.orderId,
        type: 'TRACKING_EMAIL_QUEUED',
        title: 'Tracking email queued',
        detail: 'A shipping confirmation email was queued for delivery.',
        actorType: 'SYSTEM' as const,
      })
    }

    if (timelineEvents.length) {
      await tx.orderEvent.createMany({
        data: timelineEvents,
      })
    }

    return createdFulfillment
  })

  // fulfillment is already committed — event emission is best-effort
  try {
    await emitInternalEvent('fulfillment.created', {
      fulfillmentId: fulfillment.id,
      orderId: data.orderId,
      trackingNumber: fulfillment.trackingNumber ?? undefined,
      sendTrackingEmail: Boolean(data.sendTrackingEmail),
    })
  } catch (error) {
    console.error('[createManualFulfillment] event emission failed after fulfillment commit', error)
  }

  return fulfillment
}

export async function getAnalytics() {
  const [totalRevenue, orderCount, customerCount, topProducts] = await Promise.all([
    prisma.order.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { totalCents: true },
    }),
    prisma.order.count(),
    prisma.customer.count(),
    prisma.orderItem.groupBy({
      by: ['productId', 'title'],
      _sum: { quantity: true, totalCents: true },
      orderBy: { _sum: { totalCents: 'desc' } },
      take: 5,
    }),
  ])

  const totalRevenueCents = totalRevenue._sum.totalCents ?? 0
  const aovCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0

  return {
    totalRevenue: centsToDollars(totalRevenueCents),
    totalRevenueCents,
    orderCount,
    customerCount,
    averageOrderValue: centsToDollars(aovCents),
    averageOrderValueCents: aovCents,
    topProducts: topProducts.map((product) => ({
      ...product,
      _sum: {
        quantity: product._sum.quantity,
        totalCents: product._sum.totalCents,
        total: centsToDollars(product._sum.totalCents ?? 0),
      },
    })),
  }
}

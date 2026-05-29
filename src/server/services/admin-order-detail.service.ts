import type { ShippingLiveProvider } from '@prisma/client'

import { centsToDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { getShippingProviderConnectionStatus } from '@/server/shipping/shipping-provider.service'
import { resolveLabelProvider } from '@/server/shipping/shipping-provider-selection'
import {
  resolveOrderFulfillmentSnapshot,
  shippingStatusToFilterValue,
  shippingStatusToUiLabel,
} from '@/server/services/fulfillment-status.service'
import { getRuntimeProviderConnection } from '@/server/services/provider-connection.service'

function normalizeStatusLabel(value: string | null | undefined) {
  return String(value || '').toLowerCase().replaceAll('_', ' ')
}

function joinAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
}

function resolveReturnStatus(returns: Array<{ status: string }>) {
  if (!returns.length) return 'none'
  return String(returns[0].status || 'none').toLowerCase()
}

function mapTimeline(entries: Array<{
  id: string
  type: string
  title: string
  detail: string | null
  actorType: string
  actorId: string | null
  createdAt: Date
}>) {
  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    event: entry.title,
    title: entry.title,
    detail: entry.detail,
    actorType: entry.actorType,
    actorId: entry.actorId,
    createdAt: entry.createdAt,
  }))
}

function mapCustomerVisibleNotes(
  timeline: Array<{
    id: string
    type: string
    detail: string | null
    createdAt: Date
    actorType: string
  }>
) {
  return timeline
    .filter((entry) => entry.type === 'CUSTOMER_NOTE_ADDED' && Boolean(entry.detail))
    .map((entry) => ({
      id: entry.id,
      note: entry.detail as string,
      createdAt: entry.createdAt,
      actorType: entry.actorType,
    }))
}

function mapShippingLabelList(
  labels: Array<{
    id: string
    fulfillmentId: string | null
    provider: string
    providerLabelId: string | null
    providerRateId: string | null
    providerShipmentId: string | null
    status: string
    carrier: string | null
    service: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    labelUrl: string | null
    labelFormat: string | null
    rateAmountCents: number | null
    labelAmountCents: number | null
    currency: string | null
    createdAt: Date
    updatedAt: Date
  }>
) {
  return labels.map((label) => ({
    id: label.id,
    fulfillmentId: label.fulfillmentId,
    provider: label.provider,
    providerLabelId: label.providerLabelId,
    providerRateId: label.providerRateId,
    providerShipmentId: label.providerShipmentId,
    status: label.status,
    carrier: label.carrier,
    service: label.service,
    trackingNumber: label.trackingNumber,
    trackingUrl: label.trackingUrl,
    labelUrl: label.labelUrl,
    labelFormat: label.labelFormat,
    rateAmount: label.rateAmountCents == null ? null : centsToDollars(label.rateAmountCents),
    rateAmountCents: label.rateAmountCents,
    labelAmount: label.labelAmountCents == null ? null : centsToDollars(label.labelAmountCents),
    labelAmountCents: label.labelAmountCents,
    currency: label.currency,
    createdAt: label.createdAt,
    updatedAt: label.updatedAt,
  }))
}

function mapFulfillmentList(
  fulfillments: Array<{
    id: string
    status: string
    carrier: string | null
    service: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    labelUrl: string | null
    shippedAt: Date | null
    deliveredAt: Date | null
    createdAt: Date
    updatedAt: Date
    items: Array<{ id: string; orderItemId: string; variantId: string | null; quantity: number }>
    shippingLabels: Array<{
      id: string
      provider: string
      trackingNumber: string | null
      trackingUrl: string | null
      labelUrl: string | null
      status: string
      carrier: string | null
      service: string | null
      labelFormat: string | null
      labelAmountCents: number | null
      createdAt: Date
    }>
  }>
) {
  return fulfillments.map((fulfillment) => ({
    id: fulfillment.id,
    status: fulfillment.status,
    carrier: fulfillment.carrier,
    service: fulfillment.service,
    trackingNumber: fulfillment.trackingNumber,
    trackingUrl: fulfillment.trackingUrl,
    labelUrl: fulfillment.labelUrl,
    shippedAt: fulfillment.shippedAt,
    deliveredAt: fulfillment.deliveredAt,
    createdAt: fulfillment.createdAt,
    updatedAt: fulfillment.updatedAt,
    items: fulfillment.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    shippingLabels: fulfillment.shippingLabels.map((label) => ({
      id: label.id,
      provider: label.provider,
      trackingNumber: label.trackingNumber,
      trackingUrl: label.trackingUrl,
      labelUrl: label.labelUrl,
      status: label.status,
      carrier: label.carrier,
      service: label.service,
      labelFormat: label.labelFormat,
      labelAmount: label.labelAmountCents == null ? null : centsToDollars(label.labelAmountCents),
      labelAmountCents: label.labelAmountCents,
      createdAt: label.createdAt,
    })),
  }))
}

async function resolveShippingAndEmailCapabilities(input: {
  orderEmail: string | null
  customerEmail: string | null
}) {
  const store = await prisma.store.findFirst({
    select: {
      shippingLiveProvider: true,
      shippingProviderUsage: true,
      labelProvider: true,
    },
  })

  const providerCandidates: ShippingLiveProvider[] = ['SHIPPO', 'EASYPOST']
  const providerStatuses = await Promise.all(
    providerCandidates.map(async (provider) => ({
      provider,
      status: await getShippingProviderConnectionStatus(provider),
    }))
  )

  const connectedProviders = providerStatuses
    .filter((entry) => Boolean(entry.status.connected))
    .map((entry) => entry.provider)

  const configuredLabelProvider = store ? resolveLabelProvider(store) : null
  const labelProvider =
    (configuredLabelProvider && connectedProviders.includes(configuredLabelProvider)
      ? configuredLabelProvider
      : connectedProviders[0] ?? configuredLabelProvider) || null

  const canBuyShippingLabelFromProvider = connectedProviders.length > 0

  const emailRuntime = await getRuntimeProviderConnection('RESEND')
  const emailProviderConfigured = Boolean(
    emailRuntime.source !== 'none' && emailRuntime.credentials?.API_KEY
  )

  const hasCustomerEmail = Boolean(input.orderEmail || input.customerEmail)

  return {
    canBuyShippingLabelFromProvider,
    shippingCapabilities: {
      labelProvider: labelProvider || null,
      providerConnected: canBuyShippingLabelFromProvider,
      connectedProviders,
      providerConnectionByName: providerStatuses.reduce<Record<string, boolean>>((acc, entry) => {
        acc[entry.provider] = Boolean(entry.status.connected)
        return acc
      }, {}),
      providerUsage: store?.shippingProviderUsage || null,
      canBuyShippingLabel: canBuyShippingLabelFromProvider,
    },
    emailCapabilities: {
      hasCustomerEmail,
      providerConfigured: emailProviderConfigured,
    },
  }
}

function buildCoreAvailableActions(input: {
  paymentStatusRaw: string
  derivedFulfillmentStatus: string
}) {
  return {
    canManualFulfill: ['paid', 'partially refunded'].includes(normalizeStatusLabel(input.paymentStatusRaw)),
    canBuyShippingLabel: false,
    canRefund: ['paid', 'partially refunded'].includes(normalizeStatusLabel(input.paymentStatusRaw)),
    canCreateReturn: true,
    canMarkPaid: ['pending', 'failed', 'voided'].includes(normalizeStatusLabel(input.paymentStatusRaw)),
    canMarkPaymentPending: ['paid', 'partially refunded', 'refunded'].includes(
      normalizeStatusLabel(input.paymentStatusRaw)
    ),
    canMarkFulfilled: ['unfulfilled', 'partially fulfilled'].includes(
      normalizeStatusLabel(input.derivedFulfillmentStatus)
    ),
    canMarkUnfulfilled: ['fulfilled'].includes(normalizeStatusLabel(input.derivedFulfillmentStatus)),
  }
}

export async function getAdminOrderCoreByOrderNumber(orderNumber: number) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      customer: {
        include: {
          addresses: {
            select: {
              isDefault: true,
              address1: true,
              city: true,
              province: true,
            },
          },
        },
      },
      items: {
        include: {
          product: {
            select: {
              fulfillmentType: true,
            },
          },
          variant: {
            select: {
              title: true,
              sku: true,
            },
          },
        },
      },
      addresses: true,
      payments: true,
      discountApplications: {
        include: {
          discount: {
            select: {
              id: true,
              title: true,
              code: true,
              method: true,
            },
          },
        },
      },
      fulfillments: {
        select: {
          status: true,
          deliveredAt: true,
          items: {
            select: {
              orderItemId: true,
              quantity: true,
            },
          },
        },
      },
      returns: {
        select: { status: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!order) return null

  const shippingAddress = order.addresses.find((entry) => entry.type === 'SHIPPING') || null
  const billingAddress = order.addresses.find((entry) => entry.type === 'BILLING') || null

  const lineItems = order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    title: item.title,
    variant: item.variantTitle || item.variant?.title || '',
    variantTitle: item.variantTitle || item.variant?.title || '',
    sku: item.sku || item.variant?.sku || '',
    fulfillmentType: item.product?.fulfillmentType || 'PHYSICAL',
    quantity: item.quantity,
    price: centsToDollars(item.priceCents),
    priceCents: item.priceCents,
    total: centsToDollars(item.totalCents),
    totalCents: item.totalCents,
    totalDiscount: centsToDollars(item.totalDiscountCents),
    totalDiscountCents: item.totalDiscountCents,
  }))

  const paymentSummary = {
    currency: order.currency,
    subtotal: centsToDollars(order.subtotalCents),
    subtotalCents: order.subtotalCents,
    shippingAmount: centsToDollars(order.shippingAmountCents),
    shippingAmountCents: order.shippingAmountCents,
    taxAmount: centsToDollars(order.taxAmountCents),
    taxAmountCents: order.taxAmountCents,
    discountAmount: centsToDollars(order.discountAmountCents),
    discountAmountCents: order.discountAmountCents,
    total: centsToDollars(order.totalCents),
    totalCents: order.totalCents,
  }

  const discounts = order.discountApplications.map((application) => ({
    id: application.id,
    discountId: application.discountId,
    title: application.discount?.title || 'Discount',
    code: application.discount?.code || null,
    method: application.discount?.method || null,
    amount: centsToDollars(application.amountCents),
    amountCents: application.amountCents,
  }))

  const payments = order.payments.map((payment) => ({
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amount: centsToDollars(payment.amountCents),
    amountCents: payment.amountCents,
    currency: payment.currency,
    stripePaymentIntentId: payment.stripePaymentIntentId,
    stripeChargeId: payment.stripeChargeId,
    receiptUrl: payment.receiptUrl,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  }))

  const derivedFulfillmentSnapshot = resolveOrderFulfillmentSnapshot({
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
    id: order.id,
    orderId: order.id,
    orderNumber: `#${order.orderNumber}`,
    orderNumberValue: order.orderNumber,
    displayNumber: `#${order.orderNumber}`,
    sourceChannel: order.channel || 'Online Store',
    channel: order.channel || 'Online Store',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: normalizeStatusLabel(order.status),
    orderStatus: order.status,
    paymentStatus: normalizeStatusLabel(order.paymentStatus),
    paymentStatusRaw: order.paymentStatus,
    fulfillmentStatus: normalizeStatusLabel(derivedFulfillmentSnapshot.fulfillmentStatus),
    fulfillmentStatusRaw: derivedFulfillmentSnapshot.fulfillmentStatus,
    shippingStatus: shippingStatusToUiLabel(derivedFulfillmentSnapshot.shippingStatus),
    shippingStatusRaw: derivedFulfillmentSnapshot.shippingStatus,
    deliveryStatus: shippingStatusToFilterValue(derivedFulfillmentSnapshot.shippingStatus),
    returnStatus: resolveReturnStatus(order.returns),
    customer: order.customer
      ? {
          id: order.customer.id,
          name:
            [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') ||
            order.customer.email ||
            'Customer',
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone,
          acceptsMarketing: order.customer.acceptsMarketing,
          tags: order.customer.tags || [],
          note: order.customer.note,
          totalSpent: centsToDollars(order.customer.totalSpentCents),
          totalSpentCents: order.customer.totalSpentCents,
          orderCount: order.customer.orderCount,
          defaultAddress:
            joinAddress([
              order.customer.addresses.find((entry) => entry.isDefault)?.address1 ||
                order.customer.addresses[0]?.address1,
              order.customer.addresses.find((entry) => entry.isDefault)?.city ||
                order.customer.addresses[0]?.city,
              order.customer.addresses.find((entry) => entry.isDefault)?.province ||
                order.customer.addresses[0]?.province,
            ]) || null,
        }
      : null,
    customerNote: order.customer?.note ?? null,
    customerVisibleNotes: [],
    email: order.email || order.customer?.email || null,
    notes: order.note || '',
    note: order.note || '',
    tags: order.tags || [],
    lineItems,
    items: lineItems,
    discounts,
    discountApplications: discounts,
    shippingSummary: {
      amount: paymentSummary.shippingAmount,
      amountCents: paymentSummary.shippingAmountCents,
      methodName: order.shippingMethodName,
      rateType: order.shippingRateType,
      provider: order.shippingProvider,
      providerRateId: order.shippingProviderRateId,
      estimatedDeliveryText: order.estimatedDeliveryText,
      address: shippingAddress
        ? {
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            company: shippingAddress.company,
            address1: shippingAddress.address1,
            address2: shippingAddress.address2,
            city: shippingAddress.city,
            province: shippingAddress.province,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
          }
        : null,
    },
    taxSummary: {
      amount: paymentSummary.taxAmount,
      amountCents: paymentSummary.taxAmountCents,
    },
    paymentSummary,
    payments,
    refunds: [],
    returns: [],
    fulfillments: [],
    shipments: [],
    shippingLabels: [],
    timeline: [],
    events: [],
    timelineLoaded: false,
    fulfillmentLoaded: false,
    shippingAddress:
      joinAddress([shippingAddress?.address1, shippingAddress?.city, shippingAddress?.province]) || null,
    billingAddress:
      joinAddress([billingAddress?.address1, billingAddress?.city, billingAddress?.province]) || null,
    addresses: order.addresses,
    deliveryMethod: order.shippingAmountCents > 0 ? 'Standard shipping' : 'Free shipping',
    shippingMethodName: order.shippingMethodName,
    shippingRateType: order.shippingRateType,
    shippingProvider: order.shippingProvider,
    shippingProviderRateId: order.shippingProviderRateId,
    estimatedDeliveryText: order.estimatedDeliveryText,
    shippingCapabilities: {
      labelProvider: null,
      providerConnected: false,
      connectedProviders: [],
      providerConnectionByName: {},
      providerUsage: null,
      canBuyShippingLabel: false,
    },
    emailCapabilities: {
      hasCustomerEmail: Boolean(order.email || order.customer?.email),
      providerConfigured: false,
    },
    total: paymentSummary.total,
    subtotal: paymentSummary.subtotal,
    shippingAmount: paymentSummary.shippingAmount,
    taxAmount: paymentSummary.taxAmount,
    discountAmount: paymentSummary.discountAmount,
    currency: order.currency,
    itemCount: lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    availableActions: buildCoreAvailableActions({
      paymentStatusRaw: order.paymentStatus,
      derivedFulfillmentStatus: derivedFulfillmentSnapshot.fulfillmentStatus,
    }),
  }
}

export async function getAdminOrderDetailTimelineByOrderNumber(orderNumber: number) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      events: {
        select: {
          id: true,
          type: true,
          title: true,
          detail: true,
          actorType: true,
          actorId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!order) return null

  const timeline = mapTimeline(order.events)
  return {
    timeline,
    events: timeline,
    customerVisibleNotes: mapCustomerVisibleNotes(timeline),
    timelineLoaded: true,
  }
}

export async function getAdminOrderDetailFulfillmentByOrderNumber(orderNumber: number) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      paymentStatus: true,
      email: true,
      customer: {
        select: {
          email: true,
        },
      },
      fulfillments: {
        include: {
          items: true,
          shippingLabels: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      shippingLabels: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!order) return null

  const capabilities = await resolveShippingAndEmailCapabilities({
    orderEmail: order.email,
    customerEmail: order.customer?.email ?? null,
  })

  const canBuyShippingLabel =
    ['paid', 'partially refunded'].includes(normalizeStatusLabel(order.paymentStatus)) &&
    capabilities.canBuyShippingLabelFromProvider

  const fulfillments = mapFulfillmentList(order.fulfillments)

  return {
    fulfillments,
    shipments: fulfillments,
    shippingLabels: mapShippingLabelList(order.shippingLabels),
    fulfillmentLoaded: true,
    shippingCapabilities: capabilities.shippingCapabilities,
    emailCapabilities: capabilities.emailCapabilities,
    availableActions: {
      canBuyShippingLabel,
    },
  }
}

export async function getAdminOrderDetailByOrderNumber(orderNumber: number) {
  const core = await getAdminOrderCoreByOrderNumber(orderNumber)
  if (!core) return null

  const [timeline, fulfillment] = await Promise.all([
    getAdminOrderDetailTimelineByOrderNumber(orderNumber),
    getAdminOrderDetailFulfillmentByOrderNumber(orderNumber),
  ])

  return {
    ...core,
    ...(timeline || {
      timeline: [],
      events: [],
      customerVisibleNotes: [],
      timelineLoaded: false,
    }),
    ...(fulfillment || {
      fulfillments: [],
      shipments: [],
      shippingLabels: [],
      fulfillmentLoaded: false,
      shippingCapabilities: core.shippingCapabilities,
      emailCapabilities: core.emailCapabilities,
      availableActions: {
        canBuyShippingLabel: false,
      },
    }),
    timelineLoaded: true,
    fulfillmentLoaded: true,
    availableActions: {
      ...core.availableActions,
      ...(fulfillment?.availableActions || {}),
    },
  }
}

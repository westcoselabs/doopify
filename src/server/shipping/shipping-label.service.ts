import { Prisma, type ShippingLiveProvider } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { emitInternalEvent } from '@/server/events/dispatcher'
import {
  getShippingProviderApiKey,
  getShippingProviderConnectionStatus,
  getShippingProviderLiveRates,
  purchaseShippingProviderLabel,
} from '@/server/shipping/shipping-provider.service'
import { resolveLabelProvider } from '@/server/shipping/shipping-provider-selection'
import type { ShippingRateRequest, ShippingRateQuote } from '@/server/shipping/shipping-rate.types'
import { resolveOrderFulfillmentSnapshot } from '@/server/services/fulfillment-status.service'
import { getRuntimeProviderConnection } from '@/server/services/provider-connection.service'
import { getStoreSettings } from '@/server/services/settings.service'

type OrderLabelItemInput = {
  orderItemId: string
  variantId?: string
  quantity: number
}

type OrderLabelParcelInput = {
  weightOz: number
  lengthIn: number
  widthIn: number
  heightIn: number
}

type OrderForLabel = NonNullable<Awaited<ReturnType<typeof getOrderForLabelWorkflow>>>

type ResolvedOrderContext = {
  order: OrderForLabel
  selectedItems: OrderLabelItemInput[]
}

function normalizeCountry(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

function normalizeEmail(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizePhone(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function resolveOptionalStoreField(
  store: NonNullable<Awaited<ReturnType<typeof getStoreSettings>>>,
  field: string
) {
  const dynamicStore = store as Record<string, unknown>
  const value = dynamicStore[field]
  return typeof value === 'string' ? value : null
}

function providerDisplayName(provider: ShippingLiveProvider) {
  return provider === 'EASYPOST' ? 'EasyPost' : 'Shippo'
}

function isUnitedStatesCountry(value?: string | null) {
  return normalizeCountry(value) === 'US'
}

function validateShippoOriginContact(input: {
  provider: ShippingLiveProvider
  request: ShippingRateRequest
}) {
  if (input.provider !== 'SHIPPO') return

  if (!input.request.originAddress.email) {
    throw new Error(
      'Shippo requires a ship-from email before buying USPS labels. Add an email to your shipping location or store profile.'
    )
  }

  if (!input.request.originAddress.phone) {
    throw new Error(
      'Shippo requires a ship-from phone number before buying USPS labels. Add a phone number to your shipping location or store profile.'
    )
  }
}

function validateParcel(input: OrderLabelParcelInput) {
  if (!Number.isFinite(input.weightOz) || input.weightOz <= 0) {
    throw new Error('Package weight must be greater than 0 ounces')
  }
  if (!Number.isFinite(input.lengthIn) || input.lengthIn <= 0) {
    throw new Error('Package length must be greater than 0 inches')
  }
  if (!Number.isFinite(input.widthIn) || input.widthIn <= 0) {
    throw new Error('Package width must be greater than 0 inches')
  }
  if (!Number.isFinite(input.heightIn) || input.heightIn <= 0) {
    throw new Error('Package height must be greater than 0 inches')
  }
}

async function getOrderForLabelWorkflow(orderNumber: number) {
  return prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      email: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          priceCents: true,
        },
      },
      addresses: {
        select: {
          type: true,
          firstName: true,
          lastName: true,
          phone: true,
          address1: true,
          address2: true,
          city: true,
          province: true,
          postalCode: true,
          country: true,
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
}

function resolveSelectedItems(input: {
  order: OrderForLabel
  items: OrderLabelItemInput[]
}) {
  if (!input.items.length) {
    throw new Error('At least one item is required')
  }

  const orderItemById = new Map(input.order.items.map((item) => [item.id, item]))
  const { fulfilledByOrderItemId } = resolveOrderFulfillmentSnapshot({
    orderItems: input.order.items,
    fulfillmentRows: input.order.fulfillments,
  })

  const resolved = input.items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Item quantity must be a positive integer')
    }

    const orderItem = orderItemById.get(item.orderItemId)
    if (!orderItem) {
      throw new Error('Selected item does not belong to this order')
    }

    if (item.variantId && orderItem.variantId && item.variantId !== orderItem.variantId) {
      throw new Error('Selected item variant does not match this order item')
    }

    const alreadyFulfilled = fulfilledByOrderItemId.get(item.orderItemId) ?? 0
    const remainingQuantity = Number(orderItem.quantity) - alreadyFulfilled
    if (item.quantity > remainingQuantity) {
      throw new Error(
        `Cannot ship ${item.quantity} unit(s) for item ${item.orderItemId}. Remaining fulfillable quantity is ${remainingQuantity}.`
      )
    }

    return {
      orderItemId: item.orderItemId,
      variantId: item.variantId ?? orderItem.variantId ?? undefined,
      quantity: item.quantity,
    }
  })

  return {
    selectedItems: resolved,
    fulfilledByOrderItemId,
  }
}

function resolveSubtotalForSelectedItems(input: {
  order: OrderForLabel
  selectedItems: OrderLabelItemInput[]
}) {
  const orderItemById = new Map(input.order.items.map((item) => [item.id, item]))
  return input.selectedItems.reduce((sum, item) => {
    const orderItem = orderItemById.get(item.orderItemId)
    if (!orderItem) return sum
    return sum + Number(orderItem.priceCents) * Number(item.quantity)
  }, 0)
}

function buildShippingRateRequest(input: {
  store: NonNullable<Awaited<ReturnType<typeof getStoreSettings>>>
  order: OrderForLabel
  parcel: OrderLabelParcelInput
}): ShippingRateRequest {
  const shippingAddress = input.order.addresses.find((address) => address.type === 'SHIPPING')
  if (!shippingAddress) {
    throw new Error('Order does not have a shipping address')
  }

  const locations = input.store.shippingLocations || []
  const defaultLocation =
    locations.find((location) => location.isDefault && location.isActive) ||
    locations.find((location) => location.isActive) ||
    null

  if (!defaultLocation) {
    throw new Error('A default active ship-from location is required before buying labels.')
  }

  if (!defaultLocation.address1 || !defaultLocation.city || !defaultLocation.postalCode || !defaultLocation.country) {
    throw new Error('Default ship-from location is incomplete. Complete shipping setup before buying labels.')
  }

  if (!shippingAddress.address1) {
    throw new Error(
      'Order shipping address is missing address line 1. Correct the shipping address before buying a label.'
    )
  }
  if (!shippingAddress.city) {
    throw new Error('Order shipping address is missing a city. Correct the shipping address before buying a label.')
  }
  if (!shippingAddress.postalCode) {
    throw new Error(
      'Order shipping address is missing a ZIP/postal code. Correct the shipping address before buying a label.'
    )
  }
  if (!shippingAddress.country) {
    throw new Error(
      'Order shipping address is missing a country. Correct the shipping address before buying a label.'
    )
  }
  if (isUnitedStatesCountry(shippingAddress.country) && !shippingAddress.province) {
    throw new Error(
      'Order shipping address is missing a state/province. Correct the shipping address before buying a label.'
    )
  }

  const resolvedShipFromEmail =
    normalizeEmail(defaultLocation.email) ||
    normalizeEmail(input.store.supportEmail) ||
    normalizeEmail(input.store.email) ||
    normalizeEmail(resolveOptionalStoreField(input.store, 'shippingOriginEmail'))
  const resolvedShipFromPhone =
    normalizePhone(defaultLocation.phone) ||
    normalizePhone(resolveOptionalStoreField(input.store, 'supportPhone')) ||
    normalizePhone(input.store.phone) ||
    normalizePhone(input.store.shippingOriginPhone)

  return {
    apiKey: '',
    currency: (input.store.currency || 'USD').toUpperCase(),
    originAddress: {
      name: defaultLocation.contactName || defaultLocation.name || input.store.shippingOriginName,
      phone: resolvedShipFromPhone,
      email: resolvedShipFromEmail,
      address1: defaultLocation.address1,
      address2: defaultLocation.address2,
      city: defaultLocation.city,
      province: defaultLocation.stateProvince,
      postalCode: defaultLocation.postalCode,
      country: normalizeCountry(defaultLocation.country),
    },
    destinationAddress: {
      name: [shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(' ').trim() || undefined,
      phone: shippingAddress.phone,
      address1: shippingAddress.address1,
      address2: shippingAddress.address2,
      city: shippingAddress.city,
      province: shippingAddress.province,
      postalCode: shippingAddress.postalCode,
      country: normalizeCountry(shippingAddress.country),
    },
    parcel: {
      weightOz: Number(input.parcel.weightOz),
      lengthIn: Number(input.parcel.lengthIn),
      widthIn: Number(input.parcel.widthIn),
      heightIn: Number(input.parcel.heightIn),
    },
  }
}

async function resolveLiveProviderForLabels() {
  const store = await getStoreSettings()
  if (!store) throw new Error('Store is not configured')

  const configuredProvider = resolveLabelProvider(store)
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

  const provider =
    (configuredProvider && connectedProviders.includes(configuredProvider)
      ? configuredProvider
      : connectedProviders[0] ?? configuredProvider) || null
  if (!provider) {
    throw new Error('A live shipping provider must be connected to buy labels')
  }

  const connection = await getShippingProviderConnectionStatus(provider)
  if (!connection.connected) {
    throw new Error(`${provider} is not connected. Connect provider credentials before buying labels.`)
  }

  const apiKey = await getShippingProviderApiKey(provider)
  if (!apiKey) {
    throw new Error('Provider credentials are unavailable. Reconnect provider credentials and try again.')
  }

  return {
    provider,
    apiKey,
    store,
    connectedProviders,
  }
}

async function resolveLiveProviderForLabelsWithOverride(input: {
  requestedProvider?: ShippingLiveProvider
}) {
  const store = await getStoreSettings()
  if (!store) throw new Error('Store is not configured')

  if (!input.requestedProvider) {
    return resolveLiveProviderForLabels()
  }

  const provider = input.requestedProvider
  const connection = await getShippingProviderConnectionStatus(provider)
  if (!connection.connected) {
    throw new Error(
      `${provider} is not connected. Connect and verify ${provider} credentials before buying labels.`
    )
  }

  const apiKey = await getShippingProviderApiKey(provider)
  if (!apiKey) {
    throw new Error('Provider credentials are unavailable. Reconnect provider credentials and try again.')
  }

  return {
    provider,
    apiKey,
    store,
    connectedProviders: [provider],
  }
}

async function resolveOrderContext(input: {
  orderNumber: number
  items: OrderLabelItemInput[]
}): Promise<ResolvedOrderContext> {
  const order = await getOrderForLabelWorkflow(input.orderNumber)
  if (!order) {
    throw new Error('Order not found')
  }

  const { selectedItems } = resolveSelectedItems({
    order,
    items: input.items,
  })

  return {
    order,
    selectedItems,
  }
}

function resolveSelectedQuote(input: {
  quotes: ShippingRateQuote[]
  providerRateId: string
}) {
  const normalized = input.providerRateId.trim()
  return (
    input.quotes.find((quote) => quote.providerRateId === normalized) ??
    input.quotes.find((quote) => quote.id === normalized)
  )
}

function resolveProviderSource(provider: ShippingLiveProvider) {
  return provider === 'EASYPOST' ? 'EASYPOST' : 'SHIPPO'
}

export async function getOrderShippingRatesForLabel(input: {
  orderNumber: number
  items: OrderLabelItemInput[]
  parcel: OrderLabelParcelInput
  provider?: ShippingLiveProvider
}) {
  validateParcel(input.parcel)

  const { order, selectedItems } = await resolveOrderContext({
    orderNumber: input.orderNumber,
    items: input.items,
  })
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
    throw new Error('Labels can only be purchased for paid orders')
  }
  const { provider, apiKey, store } = await resolveLiveProviderForLabelsWithOverride({
    requestedProvider: input.provider,
  })
  const request = buildShippingRateRequest({
    store,
    order,
    parcel: input.parcel,
  })

  validateShippoOriginContact({ provider, request })

  const quotes = await getShippingProviderLiveRates({
    provider,
    request: {
      ...request,
      apiKey,
    },
  })

  if (!quotes.length) {
    console.warn('[shipping-label] provider returned zero rates', {
      provider,
      destinationHasPostalCode: Boolean(request.destinationAddress.postalCode),
      destinationHasStateProvince: Boolean(request.destinationAddress.province),
      originHasPostalCode: Boolean(request.originAddress.postalCode),
      originHasStateProvince: Boolean(request.originAddress.province),
      parcel: request.parcel,
    })

    throw new Error(
      `No label rates returned from ${providerDisplayName(provider)}. Check destination ZIP/postal code, ship-from address, package dimensions, and enabled carriers in your provider account.`
    )
  }

  return {
    provider,
    apiKey,
    store,
    source: resolveProviderSource(provider),
    currency: (store.currency || 'USD').toUpperCase(),
    subtotalCents: resolveSubtotalForSelectedItems({
      order,
      selectedItems,
    }),
    quotes,
    request,
    order,
    selectedItems,
  }
}

export async function buyOrderShippingLabel(input: {
  orderNumber: number
  items: OrderLabelItemInput[]
  parcel: OrderLabelParcelInput
  providerRateId: string
  provider?: ShippingLiveProvider
  sendTrackingEmail?: boolean
  // EasyPost requires the shipment id from the original rates call to purchase from that shipment.
  // Shippo uses the rate's object_id directly. Both are stable as long as the provider has not
  // expired the shipment. Pass the shipmentId from the rate quote's metadata to avoid a re-fetch
  // that would create a new provider shipment and invalidate the selected rate id.
  shipmentId?: string
  labelFormat?: string
  labelSize?: string
}) {
  if (!input.providerRateId?.trim()) {
    throw new Error('providerRateId is required to buy a label')
  }
  validateParcel(input.parcel)

  // Validate order and items without re-fetching live rates from the provider.
  const { order, selectedItems } = await resolveOrderContext({
    orderNumber: input.orderNumber,
    items: input.items,
  })

  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) {
    throw new Error('Labels can only be purchased for paid orders')
  }

  const { provider, apiKey, store } = await resolveLiveProviderForLabelsWithOverride({
    requestedProvider: input.provider,
  })

  // Build the rate request for the provider call and for persisting shipment context.
  // This validates the ship-from location and destination address are present.
  const request = buildShippingRateRequest({ store, order, parcel: input.parcel })
  validateShippoOriginContact({ provider, request })

  const safeProviderRateId = input.providerRateId.trim()
  const safeShipmentId = input.shipmentId?.trim()

  const duplicateLabel = await prisma.shippingLabel.findFirst({
    where: {
      orderId: order.id,
      provider,
      providerRateId: safeProviderRateId,
      status: {
        in: ['PURCHASED', 'SUCCESS', 'QUEUED'],
      },
    },
    include: {
      fulfillment: {
        include: {
          items: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (duplicateLabel) {
    return {
      shippingLabel: duplicateLabel,
      fulfillment: duplicateLabel.fulfillment,
      duplicate: true as const,
    }
  }

  // Buy directly using the rate/shipment ids from the original rate selection.
  // This avoids re-fetching rates (which would create a new provider shipment with new
  // rate ids, making the originally selected providerRateId invalid).
  const purchasedLabel = await purchaseShippingProviderLabel({
    provider,
    request: {
      apiKey,
      rateId: safeProviderRateId,
      shipmentId: safeShipmentId,
      request,
      labelFormat: input.labelFormat,
      labelSize: input.labelSize,
    },
  })

  const { fulfilledByOrderItemId } = resolveOrderFulfillmentSnapshot({
    orderItems: order.items,
    fulfillmentRows: order.fulfillments,
  })

  for (const item of selectedItems) {
    const current = fulfilledByOrderItemId.get(item.orderItemId) ?? 0
    fulfilledByOrderItemId.set(item.orderItemId, current + item.quantity)
  }

  const nextFulfillmentStatus = resolveOrderFulfillmentSnapshot({
    orderItems: order.items,
    fulfillmentRows: [
      ...order.fulfillments,
      {
        status: 'SUCCESS',
        deliveredAt: null,
        items: selectedItems.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
    ],
  }).fulfillmentStatus

  const currency = (store.currency || 'USD').toUpperCase()
  const hasCustomerEmail = Boolean(order.email)
  const emailRuntime = await getRuntimeProviderConnection('RESEND')
  const emailProviderConfigured = Boolean(
    emailRuntime.source !== 'none' && emailRuntime.credentials?.API_KEY
  )
  const trackingEmailRequested = Boolean(input.sendTrackingEmail)
  const shouldQueueTrackingEmail =
    trackingEmailRequested && hasCustomerEmail && emailProviderConfigured

  const saved = await prisma.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.create({
      data: {
        orderId: order.id,
        status: purchasedLabel.status === 'QUEUED' ? 'PENDING' : 'SUCCESS',
        carrier: purchasedLabel.carrier,
        service: purchasedLabel.service,
        trackingNumber: purchasedLabel.trackingNumber,
        trackingUrl: purchasedLabel.trackingUrl,
        labelUrl: purchasedLabel.labelUrl,
        shippedAt: new Date(),
        items: {
          create: selectedItems.map((item) => ({
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

    const shippingLabel = await tx.shippingLabel.create({
      data: {
        orderId: order.id,
        fulfillmentId: fulfillment.id,
        provider,
        providerShipmentId: purchasedLabel.providerShipmentId ?? safeShipmentId,
        providerRateId: purchasedLabel.providerRateId ?? safeProviderRateId,
        providerLabelId: purchasedLabel.providerLabelId,
        carrier: purchasedLabel.carrier,
        service: purchasedLabel.service,
        status: purchasedLabel.status || 'PURCHASED',
        labelUrl: purchasedLabel.labelUrl,
        labelFormat: input.labelFormat ?? store.defaultLabelFormat ?? 'PDF',
        trackingNumber: purchasedLabel.trackingNumber,
        trackingUrl: purchasedLabel.trackingUrl,
        rateAmountCents: purchasedLabel.rateAmountCents,
        labelAmountCents: purchasedLabel.labelAmountCents ?? purchasedLabel.rateAmountCents,
        currency: (purchasedLabel.currency || currency).toUpperCase(),
        rawResponse: {
          providerResponse: purchasedLabel.rawResponse ?? null,
          requestSummary: {
            providerRateId: safeProviderRateId,
            shipmentId: safeShipmentId,
            items: selectedItems,
            parcel: input.parcel,
            labelFormat: input.labelFormat,
            labelSize: input.labelSize,
          },
        } as Prisma.InputJsonValue,
      },
    })

    await tx.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: nextFulfillmentStatus,
      },
    })

    const timelineEvents: Prisma.OrderEventCreateManyInput[] = [
      {
        orderId: order.id,
        type: 'SHIPPING_LABEL_PURCHASED',
        title: 'Shipping label purchased',
        detail: `${provider} label purchased (${safeProviderRateId})`,
        actorType: 'STAFF' as const,
      },
      {
        orderId: order.id,
        type: 'TRACKING_ADDED',
        title: 'Tracking added',
        detail: purchasedLabel.trackingNumber
          ? `Tracking number ${purchasedLabel.trackingNumber} was saved from the purchased label.`
          : 'Tracking details were saved from the purchased label.',
        actorType: 'STAFF' as const,
      },
      {
        orderId: order.id,
        type: 'ORDER_MARKED_SHIPPED',
        title: 'Order marked shipped',
        detail:
          nextFulfillmentStatus === 'PARTIALLY_FULFILLED'
            ? 'A partial shipment was created from the purchased label.'
            : 'All items are now marked as shipped.',
        actorType: 'STAFF' as const,
      },
    ]

    if (shouldQueueTrackingEmail) {
      timelineEvents.push({
        orderId: order.id,
        type: 'TRACKING_EMAIL_QUEUED',
        title: 'Tracking email queued',
        detail: 'A shipping confirmation email was queued for delivery.',
        actorType: 'SYSTEM' as const,
      })
    }

    await tx.orderEvent.createMany({
      data: timelineEvents,
    })

    return { fulfillment, shippingLabel }
  })

  await emitInternalEvent('fulfillment.created', {
    fulfillmentId: saved.fulfillment.id,
    orderId: order.id,
    trackingNumber: saved.fulfillment.trackingNumber ?? undefined,
    sendTrackingEmail: shouldQueueTrackingEmail,
  })

  return {
    ...saved,
    duplicate: false as const,
    trackingEmail: {
      requested: trackingEmailRequested,
      queued: shouldQueueTrackingEmail,
      skippedReason: shouldQueueTrackingEmail
        ? null
        : trackingEmailRequested
          ? !hasCustomerEmail
            ? 'MISSING_CUSTOMER_EMAIL'
            : 'EMAIL_PROVIDER_NOT_CONFIGURED'
          : 'NOT_REQUESTED',
    },
  }
}

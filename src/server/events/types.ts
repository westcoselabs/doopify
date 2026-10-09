import type { Prisma } from '@prisma/client'

export type EventPersistenceContext = { client: Prisma.TransactionClient }

export type DoopifyEvents = {
  'checkout.created': {
    checkoutSessionId: string
    paymentIntentId: string
    email: string
    total: number
    currency: string
  }
  'checkout.failed': {
    paymentIntentId: string
    email?: string | null
    reason?: string | null
  }
  'checkout.abandoned': {
    checkoutSessionId: string
    email?: string | null
    total: number
    currency: string
  }
  'checkout.recovery_email_sent': {
    checkoutSessionId: string
    email: string
    total: number
    currency: string
    recoveryEmailCount: number
  }
  'checkout.recovered': {
    checkoutSessionId: string
    email: string
    total: number
    currency: string
  }
  'order.created': {
    orderId: string
    orderNumber: number
    email?: string | null
    total: number
    currency: string
  }
  'order.paid': {
    orderId: string
    orderNumber: number
    email?: string | null
    total: number
    currency: string
    items: Array<{
      title: string
      variantTitle?: string | null
      quantity: number
      price: number
    }>
    shippingAddress?: {
      firstName?: string | null
      lastName?: string | null
      address1?: string | null
      city?: string | null
      province?: string | null
      postalCode?: string | null
      country?: string | null
    }
  }
  'product.created': {
    productId: string
    handle: string
    title: string
    status: string
  }
  'product.updated': {
    productId: string
    handle: string
    title: string
    status: string
  }
  'fulfillment.created': {
    fulfillmentId: string
    orderId: string
    trackingNumber?: string | null
    sendTrackingEmail?: boolean
  }
  'order.refunded': {
    orderId: string
    orderNumber: number
    refundId: string
    amount: number
    currency: string
  }
  'refund.issued': {
    orderId: string
    orderNumber: number
    refundId: string
    amount: number
    currency: string
  }
  'order.return_requested': {
    orderId: string
    orderNumber: number
    returnId: string
  }
  'return.requested': {
    orderId: string
    orderNumber: number
    returnId: string
  }
  'order.return_updated': {
    orderId: string
    orderNumber: number
    returnId: string
    status: string
  }
  'return.closed': {
    orderId: string
    orderNumber: number
    returnId: string
  }
  'email.sent': {
    deliveryId: string
    event: string
    template: string
    recipientEmail: string
    provider: string
    providerMessageId?: string | null
    orderId?: string | null
    customerId?: string | null
    refundId?: string | null
    returnId?: string | null
  }
  'email.failed': {
    deliveryId: string
    event: string
    template: string
    recipientEmail: string
    provider: string
    error: string
    status: 'FAILED' | 'RETRYING'
    orderId?: string | null
    customerId?: string | null
    refundId?: string | null
    returnId?: string | null
  }
  'webhook.delivered': {
    direction: 'inbound' | 'outbound'
    provider: string
    providerEventId?: string
    eventType?: string
    deliveryId?: string
    integrationId?: string
    event?: string
    statusCode?: number | null
    attempts?: number
  }
  'webhook.failed': {
    direction: 'inbound' | 'outbound'
    provider: string
    error: string
    providerEventId?: string
    eventType?: string
    deliveryId?: string
    integrationId?: string
    event?: string
    statusCode?: number | null
    attempts?: number
    retryable?: boolean
  }
}

export type DoopifyEventName = keyof DoopifyEvents

export type InternalEventHandler<K extends DoopifyEventName = DoopifyEventName> = {
  event: K
  handle: (payload: DoopifyEvents[K], context?: EventPersistenceContext) => Promise<void> | void
}

export type AnyInternalEventHandler = {
  [K in DoopifyEventName]: InternalEventHandler<K>
}[DoopifyEventName]

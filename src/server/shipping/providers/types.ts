import type { ShippingRateQuote, ShippingRateRequest } from '@/server/shipping/shipping-rate.types'

export type ShippingProviderConnectionResult = {
  ok: boolean
  message: string
  retryable?: boolean
  accountId?: string
  accountType?: string
}

export type ShippingProviderAdapter = {
  testConnection(input: { apiKey: string }): Promise<ShippingProviderConnectionResult>
  getRates(input: ShippingRateRequest): Promise<ShippingRateQuote[]>
  purchaseLabel(input: ShippingProviderPurchaseLabelRequest): Promise<ShippingProviderPurchasedLabel>
  getTrackingStatus(input: ShippingProviderTrackingStatusRequest): Promise<ShippingProviderTrackingStatus>
}

export type ShippingProviderPurchaseLabelRequest = {
  apiKey: string
  rateId: string
  shipmentId?: string
  request: ShippingRateRequest
  labelFormat?: string
  labelSize?: string
}

export type ShippingProviderPurchasedLabel = {
  providerShipmentId?: string
  providerRateId?: string
  providerLabelId?: string
  carrier?: string
  service?: string
  status: string
  labelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
  rateAmountCents?: number
  labelAmountCents?: number
  currency: string
  rawResponse?: Record<string, unknown>
}

export type ShippingProviderTrackingStatusRequest = {
  apiKey: string
  providerShipmentId?: string
  providerLabelId?: string
  trackingNumber?: string
  carrier?: string
}

export type ShippingProviderTrackingStatus = {
  providerStatus: string
  lifecycleStatus: 'PRE_TRANSIT' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILURE' | 'UNKNOWN'
  deliveredAt?: string
  trackingNumber?: string
  trackingUrl?: string
  rawResponse?: Record<string, unknown>
}

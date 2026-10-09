import 'server-only'
import type { ShippingLiveProvider } from '@prisma/client'
import { env } from '@/lib/env'
import type { ShippingRateQuote, ShippingRateRequest } from './shipping-rate.types'
import { easypostProviderAdapter } from './providers/easypost'
import { shippoProviderAdapter } from './providers/shippo'
import type { ShippingProviderPurchaseLabelRequest, ShippingProviderTrackingStatusRequest } from './providers/types'

function resolveProviderAdapter(provider: ShippingLiveProvider) {
  return provider === 'EASYPOST' ? easypostProviderAdapter : shippoProviderAdapter
}

export function getShippingProviderApiKey(provider: ShippingLiveProvider) {
  return (provider === 'SHIPPO' ? env.SHIPPO_API_KEY : env.EASYPOST_API_KEY) ?? null
}

export function getShippingProviderConnectionStatus(provider: ShippingLiveProvider) {
  const configured = Boolean(getShippingProviderApiKey(provider))
  return { provider, hasCredentials: configured, connected: configured }
}

export async function testShippingProviderConnection(provider: ShippingLiveProvider) {
  const apiKey = getShippingProviderApiKey(provider)
  if (!apiKey) return { ok: false, message: 'Provider environment credentials are missing.' }
  return resolveProviderAdapter(provider).testConnection({ apiKey })
}

export async function getShippingProviderLiveRates(input: {
  provider: ShippingLiveProvider
  request: ShippingRateRequest
}): Promise<ShippingRateQuote[]> {
  const adapter = resolveProviderAdapter(input.provider)
  return adapter.getRates({
    ...input.request,
  })
}

export async function purchaseShippingProviderLabel(input: {
  provider: ShippingLiveProvider
  request: ShippingProviderPurchaseLabelRequest
}) {
  const adapter = resolveProviderAdapter(input.provider)
  return adapter.purchaseLabel(input.request)
}

export async function getShippingProviderTrackingStatus(input: {
  provider: ShippingLiveProvider
  request: Omit<ShippingProviderTrackingStatusRequest, 'apiKey'>
}) {
  const apiKey = await getShippingProviderApiKey(input.provider)
  if (!apiKey) {
    throw new Error(`${input.provider} is not connected. Configure provider environment credentials before polling tracking.`)
  }

  const adapter = resolveProviderAdapter(input.provider)
  return adapter.getTrackingStatus({
    apiKey,
    ...input.request,
  })
}

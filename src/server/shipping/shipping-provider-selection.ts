import 'server-only'
import type { ShippingLiveProvider } from '@prisma/client'
import { env } from '@/lib/env'

function selectedProvider(value: 'none' | 'shippo' | 'easypost'): ShippingLiveProvider | null {
  return value === 'shippo' ? 'SHIPPO' : value === 'easypost' ? 'EASYPOST' : null
}

export function resolveActiveRateProvider() {
  return selectedProvider(env.SHIPPING_RATE_PROVIDER)
}

export function resolveLabelProvider() {
  return selectedProvider(env.SHIPPING_LABEL_PROVIDER)
}

export function getShippingProviderSelection() {
  return { rateProvider: resolveActiveRateProvider(), labelProvider: resolveLabelProvider() }
}

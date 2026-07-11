import type { IntegrationStatus, ShippingLiveProvider } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  pickCanonicalProviderIntegration,
  resolveCanonicalProviderIntegration,
} from '@/server/services/provider-integration-resolver'
import { decrypt, encrypt } from '@/server/utils/crypto'
import type { ShippingRateQuote, ShippingRateRequest } from '@/server/shipping/shipping-rate.types'

import { easypostProviderAdapter } from './providers/easypost'
import { shippoProviderAdapter } from './providers/shippo'
import type {
  ShippingProviderConnectionResult,
  ShippingProviderPurchaseLabelRequest,
  ShippingProviderTrackingStatusRequest,
} from './providers/types'

const PROVIDER_INTEGRATION_TYPE: Record<ShippingLiveProvider, string> = {
  EASYPOST: 'SHIPPING_EASYPOST',
  SHIPPO: 'SHIPPING_SHIPPO',
}

const PROVIDER_SECRET_KEY: Record<ShippingLiveProvider, string> = {
  EASYPOST: 'API_KEY',
  SHIPPO: 'API_KEY',
}

const PROVIDER_NAME: Record<ShippingLiveProvider, string> = {
  EASYPOST: 'EasyPost Shipping',
  SHIPPO: 'Shippo Shipping',
}

function normalizeApiKey(value: string) {
  return value.trim()
}

function resolveProviderAdapter(provider: ShippingLiveProvider) {
  if (provider === 'EASYPOST') return easypostProviderAdapter
  return shippoProviderAdapter
}

export function providerToIntegrationType(provider: ShippingLiveProvider) {
  return PROVIDER_INTEGRATION_TYPE[provider]
}

export type ShippingProviderConnectionStatus = {
  provider: ShippingLiveProvider
  integrationType: string
  integrationId: string | null
  integrationStatus: IntegrationStatus | null
  hasCredentials: boolean
  connected: boolean
  updatedAt: string | null
}

export type ConnectShippingProviderInput = {
  provider: ShippingLiveProvider
  apiKey: string
}

export type DisconnectShippingProviderInput = {
  provider: ShippingLiveProvider
  clearCredentials?: boolean
}

function toConnectionStatus(
  provider: ShippingLiveProvider,
  integration: Awaited<ReturnType<typeof resolveCanonicalProviderIntegration>>
): ShippingProviderConnectionStatus {
  const secretKey = PROVIDER_SECRET_KEY[provider]
  const hasCredentials = Boolean(integration?.secrets.some((secret) => secret.key === secretKey && secret.value))
  const integrationStatus = integration?.status ?? null
  const connected = Boolean(integrationStatus === 'ACTIVE' && hasCredentials)

  return {
    provider,
    integrationType: providerToIntegrationType(provider),
    integrationId: integration?.id ?? null,
    integrationStatus,
    hasCredentials,
    connected,
    updatedAt: integration?.updatedAt?.toISOString() ?? null,
  }
}

async function getProviderApiKey(provider: ShippingLiveProvider) {
  const integration = await resolveCanonicalProviderIntegration(provider)
  if (!integration || integration.status !== 'ACTIVE') {
    return null
  }

  const secret = integration.secrets.find((entry) => entry.key === PROVIDER_SECRET_KEY[provider])
  if (!secret?.value) return null

  return {
    integrationId: integration.id,
    apiKey: decrypt(secret.value),
  }
}

export async function getShippingProviderApiKey(provider: ShippingLiveProvider) {
  const credentials = await getProviderApiKey(provider)
  if (credentials?.apiKey) return credentials.apiKey

  const envFallback =
    provider === 'SHIPPO'
      ? process.env.SHIPPO_API_KEY?.trim()
      : process.env.EASYPOST_API_KEY?.trim()

  return envFallback || null
}

export async function getShippingProviderConnectionStatus(provider: ShippingLiveProvider) {
  const integration = await resolveCanonicalProviderIntegration(provider)
  return toConnectionStatus(provider, integration)
}

export async function connectShippingProvider(input: ConnectShippingProviderInput) {
  const apiKey = normalizeApiKey(input.apiKey)
  if (!apiKey) {
    throw new Error('Provider API key is required')
  }

  const provider = input.provider
  const integrationType = providerToIntegrationType(provider)
  const providerSecretKey = PROVIDER_SECRET_KEY[provider]

  await prisma.$transaction(async (tx) => {
    const existingIntegrations = await tx.integration.findMany({
      where: { type: integrationType },
      select: {
        id: true,
        providerKey: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        secrets: {
          select: { id: true, key: true, value: true },
        },
      },
    })
    const existing = pickCanonicalProviderIntegration(provider, existingIntegrations)

    const integration =
      existing != null
        ? await tx.integration.update({
            where: { id: existing.id },
            data: {
              name: PROVIDER_NAME[provider],
              status: 'ACTIVE',
              type: integrationType,
              providerKey: provider,
            },
            select: { id: true },
          })
        : await tx.integration.create({
            data: {
              name: PROVIDER_NAME[provider],
              type: integrationType,
              status: 'ACTIVE',
              providerKey: provider,
            },
            select: { id: true },
          })

    await tx.integrationSecret.upsert({
      where: {
        integrationId_key: {
          integrationId: integration.id,
          key: providerSecretKey,
        },
      },
      create: {
        integrationId: integration.id,
        key: providerSecretKey,
        value: encrypt(apiKey),
      },
      update: {
        value: encrypt(apiKey),
      },
    })
  })

  return getShippingProviderConnectionStatus(provider)
}

export async function disconnectShippingProvider(input: DisconnectShippingProviderInput) {
  const { provider, clearCredentials = false } = input
  const integrationType = providerToIntegrationType(provider)
  const integration = await resolveCanonicalProviderIntegration(provider)

  if (!integration) {
    return getShippingProviderConnectionStatus(provider)
  }

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { status: 'INACTIVE' },
    })

    if (clearCredentials) {
      await tx.integrationSecret.deleteMany({
        where: {
          integrationId: integration.id,
          key: PROVIDER_SECRET_KEY[provider],
        },
      })
    }

    // Keep only provider-typed integration rows affected by this action.
    await tx.integration.updateMany({
      where: {
        type: integrationType,
        id: { not: integration.id },
      },
      data: { status: 'INACTIVE' },
    })
  })

  return getShippingProviderConnectionStatus(provider)
}

export async function testShippingProviderConnection(provider: ShippingLiveProvider): Promise<{
  provider: ShippingLiveProvider
  status: ShippingProviderConnectionStatus
  result: ShippingProviderConnectionResult
}> {
  const credentials = await getProviderApiKey(provider)
  const status = await getShippingProviderConnectionStatus(provider)

  if (!credentials?.apiKey) {
    return {
      provider,
      status,
      result: {
        ok: false,
        message: 'Provider is not connected. Save credentials first.',
      },
    }
  }

  const result = await testShippingProviderConnectionWithApiKey(provider, credentials.apiKey)
  return {
    provider,
    status,
    result,
  }
}

/** Tests a candidate key without persisting or returning it. */
export async function testShippingProviderConnectionWithApiKey(
  provider: ShippingLiveProvider,
  apiKey: string
): Promise<ShippingProviderConnectionResult> {
  const normalizedApiKey = normalizeApiKey(apiKey)
  if (!normalizedApiKey) {
    return { ok: false, message: 'Provider API key is required.' }
  }

  return resolveProviderAdapter(provider).testConnection({ apiKey: normalizedApiKey })
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
    throw new Error(`${input.provider} is not connected. Connect provider credentials before polling tracking.`)
  }

  const adapter = resolveProviderAdapter(input.provider)
  return adapter.getTrackingStatus({
    apiKey,
    ...input.request,
  })
}

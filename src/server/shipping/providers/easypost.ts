import type { ShippingProviderAdapter } from './types'
import type { ShippingRateQuote } from '@/server/shipping/shipping-rate.types'

const EASYPOST_API_BASE = 'https://api.easypost.com/v2'

function buildBasicAuthToken(apiKey: string) {
  return Buffer.from(`${apiKey}:`).toString('base64')
}

function truncate(text: string, max = 280) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function normalizeMoneyToCents(value: unknown) {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value.trim()) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function normalizeLifecycleStatus(value: unknown) {
  const status = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!status) return 'UNKNOWN' as const
  if (status.includes('DELIVER')) return 'DELIVERED' as const
  if (status.includes('TRANSIT')) return 'IN_TRANSIT' as const
  if (status.includes('PRE_TRANSIT') || status.includes('LABEL')) return 'PRE_TRANSIT' as const
  if (status.includes('FAIL') || status.includes('RETURN') || status.includes('EXCEPTION')) return 'FAILURE' as const
  return 'UNKNOWN' as const
}

export const easypostProviderAdapter: ShippingProviderAdapter = {
  async testConnection(input) {
    try {
      const response = await fetch(`${EASYPOST_API_BASE}/users`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${buildBasicAuthToken(input.apiKey)}`,
          Accept: 'application/json',
        },
      })

      const bodyText = await response.text()
      if (!response.ok) {
        return {
          ok: false,
          message: `EasyPost authentication failed (${response.status}): ${truncate(bodyText || 'Request failed')}`,
          retryable: response.status === 429 || response.status >= 500,
        }
      }

      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(bodyText) as Record<string, unknown>
      } catch {
        payload = null
      }

      return {
        ok: true,
        message: 'EasyPost connection successful.',
        accountId: typeof payload?.id === 'string' ? payload.id : undefined,
        accountType: typeof payload?.object === 'string' ? payload.object : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected connection failure'
      return {
        ok: false,
        message: `EasyPost connection test failed: ${message}`,
        retryable: true,
      }
    }
  },
  async getRates(input) {
    const response = await fetch(`${EASYPOST_API_BASE}/shipments`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${buildBasicAuthToken(input.apiKey)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        shipment: {
          from_address: {
            name: input.originAddress.name ?? undefined,
            phone: input.originAddress.phone ?? undefined,
            street1: input.originAddress.address1,
            street2: input.originAddress.address2 ?? undefined,
            city: input.originAddress.city,
            state: input.originAddress.province ?? undefined,
            zip: input.originAddress.postalCode,
            country: input.originAddress.country,
          },
          to_address: {
            name: input.destinationAddress.name ?? undefined,
            phone: input.destinationAddress.phone ?? undefined,
            street1: input.destinationAddress.address1,
            street2: input.destinationAddress.address2 ?? undefined,
            city: input.destinationAddress.city,
            state: input.destinationAddress.province ?? undefined,
            zip: input.destinationAddress.postalCode,
            country: input.destinationAddress.country,
          },
          parcel: {
            weight: input.parcel.weightOz,
            length: input.parcel.lengthIn,
            width: input.parcel.widthIn,
            height: input.parcel.heightIn,
          },
        },
      }),
    })

    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(`EasyPost rates request failed (${response.status}): ${truncate(bodyText || 'Request failed')}`)
    }

    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      payload = null
    }

    const rates = Array.isArray(payload?.rates) ? payload.rates : []
    const normalizedQuotes = rates
      .map((rate) => {
        const item = rate as Record<string, unknown>
        const amountCents = normalizeMoneyToCents(item.rate)
        if (amountCents == null) return null

        const providerRateId = typeof item.id === 'string' ? item.id : undefined
        const carrier = typeof item.carrier === 'string' ? item.carrier : undefined
        const service = typeof item.service === 'string' ? item.service : undefined
        const deliveryDaysRaw = item.delivery_days
        const estimatedDays =
          typeof deliveryDaysRaw === 'number'
            ? Math.round(deliveryDaysRaw)
            : typeof deliveryDaysRaw === 'string' && Number.isFinite(Number(deliveryDaysRaw))
              ? Math.round(Number(deliveryDaysRaw))
              : undefined

        return {
          id: providerRateId ?? `easypost:${carrier ?? 'carrier'}:${service ?? 'service'}:${amountCents}`,
          source: 'EASYPOST' as const,
          carrier,
          service,
          displayName: [carrier, service].filter(Boolean).join(' - ') || 'EasyPost rate',
          amountCents,
          currency: String(item.currency ?? input.currency ?? 'USD').toUpperCase(),
          estimatedDays,
          providerShipmentId: typeof payload?.id === 'string' ? payload.id : undefined,
          providerRateId,
          metadata: {
            shipmentId: payload?.id,
          },
        } satisfies ShippingRateQuote
      })
      .filter((quote) => quote != null)
      .sort((a, b) => a.amountCents - b.amountCents)

    return normalizedQuotes as ShippingRateQuote[]
  },
  async purchaseLabel(input) {
    const shipmentId = input.shipmentId?.trim()
    if (!shipmentId) {
      throw new Error('EasyPost label purchase requires a shipment id from the selected live quote')
    }

    const response = await fetch(`${EASYPOST_API_BASE}/shipments/${encodeURIComponent(shipmentId)}/buy`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${buildBasicAuthToken(input.apiKey)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        rate: {
          id: input.rateId,
        },
      }),
    })

    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(
        `EasyPost label purchase failed (${response.status}): ${truncate(bodyText || 'Request failed')}`
      )
    }

    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      payload = null
    }

    const selectedRate = payload?.selected_rate as Record<string, unknown> | undefined
    const postageLabel = payload?.postage_label as Record<string, unknown> | undefined
    const tracker = payload?.tracker as Record<string, unknown> | undefined
    const trackingNumber =
      typeof payload?.tracking_code === 'string'
        ? payload.tracking_code
        : typeof tracker?.tracking_code === 'string'
          ? tracker.tracking_code
          : undefined

    return {
      providerShipmentId: typeof payload?.id === 'string' ? payload.id : shipmentId,
      providerRateId: typeof selectedRate?.id === 'string' ? selectedRate.id : input.rateId,
      providerLabelId: typeof postageLabel?.id === 'string' ? postageLabel.id : undefined,
      carrier: typeof selectedRate?.carrier === 'string' ? selectedRate.carrier : undefined,
      service: typeof selectedRate?.service === 'string' ? selectedRate.service : undefined,
      status: 'PURCHASED',
      labelUrl:
        typeof postageLabel?.label_url === 'string'
          ? postageLabel.label_url
          : typeof postageLabel?.label_pdf_url === 'string'
            ? postageLabel.label_pdf_url
            : undefined,
      trackingNumber,
      trackingUrl:
        typeof tracker?.public_url === 'string'
          ? tracker.public_url
          : typeof payload?.tracking_url === 'string'
            ? payload.tracking_url
            : undefined,
      labelAmountCents: normalizeMoneyToCents(selectedRate?.rate) ?? undefined,
      rateAmountCents: normalizeMoneyToCents(selectedRate?.rate) ?? undefined,
      currency: String(selectedRate?.currency ?? input.request.currency ?? 'USD').toUpperCase(),
      rawResponse: payload ?? undefined,
    }
  },
  async getTrackingStatus(input) {
    const headers = {
      Authorization: `Basic ${buildBasicAuthToken(input.apiKey)}`,
      Accept: 'application/json',
    }

    const shipmentId = input.providerShipmentId?.trim()
    let response: Response

    if (shipmentId) {
      response = await fetch(`${EASYPOST_API_BASE}/shipments/${encodeURIComponent(shipmentId)}`, {
        method: 'GET',
        headers,
      })
    } else if (input.providerLabelId?.trim()) {
      response = await fetch(`${EASYPOST_API_BASE}/trackers/${encodeURIComponent(input.providerLabelId.trim())}`, {
        method: 'GET',
        headers,
      })
    } else if (input.trackingNumber?.trim()) {
      response = await fetch(`${EASYPOST_API_BASE}/trackers/${encodeURIComponent(input.trackingNumber.trim())}`, {
        method: 'GET',
        headers,
      })
    } else {
      throw new Error('EasyPost tracking lookup requires shipment id, label id, or tracking number')
    }

    const bodyText = await response.text()
    if (!response.ok) {
      throw new Error(
        `EasyPost tracking status request failed (${response.status}): ${truncate(bodyText || 'Request failed')}`
      )
    }

    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>
    } catch {
      payload = null
    }

    const tracker = (payload?.tracker as Record<string, unknown> | undefined) ?? payload
    const providerStatus =
      typeof tracker?.status === 'string'
        ? tracker.status
        : typeof payload?.status === 'string'
          ? payload.status
          : 'unknown'
    const trackingNumber =
      typeof tracker?.tracking_code === 'string'
        ? tracker.tracking_code
        : typeof payload?.tracking_code === 'string'
          ? payload.tracking_code
          : input.trackingNumber
    const trackingUrl =
      typeof tracker?.public_url === 'string'
        ? tracker.public_url
        : typeof payload?.tracking_url === 'string'
          ? payload.tracking_url
          : undefined
    const deliveredAt =
      typeof tracker?.signed_by === 'string' || normalizeLifecycleStatus(providerStatus) === 'DELIVERED'
        ? typeof tracker?.updated_at === 'string'
          ? tracker.updated_at
          : typeof payload?.updated_at === 'string'
            ? payload.updated_at
            : undefined
        : undefined

    return {
      providerStatus,
      lifecycleStatus: normalizeLifecycleStatus(providerStatus),
      deliveredAt,
      trackingNumber,
      trackingUrl,
      rawResponse: payload ?? undefined,
    }
  },
}

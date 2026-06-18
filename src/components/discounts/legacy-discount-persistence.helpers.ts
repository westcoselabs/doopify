import { dollarsToCents } from '@/lib/money'

export type LegacyDiscountDraft = {
  id?: string
  title?: string
  code?: string
  method?: string
  valueType?: string
  value?: string | number
  minimumRequirementType?: string
  minimumRequirementValue?: string | number
  usageLimit?: string | number
  status?: string
  startsAt?: string
  endsAt?: string
  combinesWith?: string[]
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || ''
}

function normalizeNumericInput(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function isPersistedLegacyDiscountId(id: string | undefined) {
  return Boolean(id && !id.startsWith('draft_'))
}

export function normalizeLegacyDiscountCode(draft: LegacyDiscountDraft) {
  const explicitCode = normalizeOptionalString(draft.code)
  if (explicitCode) return explicitCode.toUpperCase()

  const title = normalizeOptionalString(draft.title)
  if (!title) return ''
  return title.toUpperCase().replace(/\s+/g, '')
}

export function mapLegacyDraftStatusToApi(draft: LegacyDiscountDraft) {
  const rawStatus = normalizeOptionalString(draft.status).toLowerCase()
  if (draft.endsAt) {
    const endsAt = new Date(draft.endsAt)
    if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now()) return 'EXPIRED' as const
  }
  if (draft.startsAt) {
    const startsAt = new Date(draft.startsAt)
    if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now()) return 'SCHEDULED' as const
  }
  if (rawStatus === 'disabled') return 'DISABLED' as const
  if (rawStatus === 'expired') return 'EXPIRED' as const
  if (rawStatus === 'scheduled') return 'SCHEDULED' as const
  return 'ACTIVE' as const
}

export function mapLegacyDraftMethodToApi(draft: LegacyDiscountDraft) {
  if (draft.method === 'free shipping') return 'FREE_SHIPPING' as const
  if (draft.valueType === 'fixed') return 'FIXED_AMOUNT' as const
  return 'PERCENTAGE' as const
}

export function buildLegacyDiscountApiPayload(draft: LegacyDiscountDraft) {
  const method = mapLegacyDraftMethodToApi(draft)
  const normalizedValue = normalizeNumericInput(draft.value)
  const minimumRequirementValue = normalizeNumericInput(draft.minimumRequirementValue)
  const usageLimitValue = normalizeNumericInput(draft.usageLimit)
  const combinesWith = Array.isArray(draft.combinesWith) ? draft.combinesWith : []

  return {
    title: normalizeOptionalString(draft.title),
    code: normalizeLegacyDiscountCode(draft),
    type: 'CODE' as const,
    method,
    value:
      method === 'FREE_SHIPPING'
        ? 0
        : method === 'FIXED_AMOUNT'
          ? dollarsToCents(normalizedValue ?? 0)
          : normalizedValue ?? 0,
    minimumOrderCents:
      draft.minimumRequirementType === 'subtotal' && minimumRequirementValue != null
        ? dollarsToCents(minimumRequirementValue)
        : null,
    usageLimit: usageLimitValue != null && usageLimitValue > 0 ? Math.floor(usageLimitValue) : null,
    status: mapLegacyDraftStatusToApi(draft),
    startsAt: normalizeOptionalString(draft.startsAt) ? new Date(String(draft.startsAt)).toISOString() : null,
    endsAt: normalizeOptionalString(draft.endsAt) ? new Date(String(draft.endsAt)).toISOString() : null,
    combinesWithOrders: combinesWith.includes('order discounts'),
    combinesWithProducts: combinesWith.includes('product discounts'),
    combinesWithShipping: combinesWith.includes('shipping discounts'),
  }
}

export async function persistLegacyDiscountDraft(input: {
  draft: LegacyDiscountDraft
  fetchImpl?: typeof fetch
  onPersisted?: () => Promise<void> | void
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const payload = buildLegacyDiscountApiPayload(input.draft)
  const discountId = String(input.draft.id || '')
  const isEdit = isPersistedLegacyDiscountId(discountId)

  const response = await fetchImpl(isEdit ? `/api/discounts/${discountId}` : '/api/discounts', {
    method: isEdit ? 'PATCH' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const responsePayload = await response.json().catch(() => null)

  if (!response.ok || !responsePayload?.success) {
    return {
      success: false as const,
      error: responsePayload?.error || 'Failed to save discount.',
      payload,
    }
  }

  await input.onPersisted?.()

  return {
    success: true as const,
    data: responsePayload.data,
    payload,
  }
}

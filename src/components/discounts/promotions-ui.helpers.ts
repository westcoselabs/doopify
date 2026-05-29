export const PROMOTION_STATUSES = ['DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED'] as const
export const PROMOTION_TYPES = ['PRODUCT_GROUP_DISCOUNT', 'BUY_X_GET_Y', 'FREE_GIFT'] as const
export const PROMOTION_REWARD_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE'] as const

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number]
export type PromotionType = (typeof PROMOTION_TYPES)[number]
export type PromotionRewardType = (typeof PROMOTION_REWARD_TYPES)[number]

export type PromotionVariantSelection = {
  fulfillmentType: string
  productTitle: string
  quantity: number
  sku: string | null
  variantId: string
  variantTitle: string
}

export type PromotionDraft = {
  endsAt: string
  id: string | null
  name: string
  priority: string
  qualifiers: PromotionVariantSelection[]
  rewardType: PromotionRewardType
  rewards: PromotionVariantSelection[]
  startsAt: string
  status: PromotionStatus
  type: PromotionType
  usageLimit: string
  value: string
}

export type PromotionValidationIssue = {
  code: string
  message: string
  path: string
}

type ListQueryParams = {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  type?: string
}

export function createPromotionDraft(type: PromotionType = 'PRODUCT_GROUP_DISCOUNT'): PromotionDraft {
  const base: PromotionDraft = {
    id: null,
    name: '',
    status: 'DRAFT',
    type,
    rewardType: 'PERCENTAGE',
    value: '',
    startsAt: '',
    endsAt: '',
    usageLimit: '',
    priority: '100',
    qualifiers: [],
    rewards: [],
  }

  return normalizePromotionDraftForType(base)
}

export function normalizePromotionDraftForType(draft: PromotionDraft): PromotionDraft {
  if (draft.type === 'FREE_GIFT') {
    return {
      ...draft,
      rewardType: 'FREE',
      value: '0',
    }
  }

  if (draft.type === 'PRODUCT_GROUP_DISCOUNT') {
    return {
      ...draft,
      rewards: [],
    }
  }

  return draft
}

export function buildPromotionListQuery(params: ListQueryParams): string {
  const searchParams = new URLSearchParams()
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.max(1, Number(params.pageSize || 20))
  searchParams.set('page', String(page))
  searchParams.set('pageSize', String(pageSize))

  const search = String(params.search || '').trim()
  if (search) {
    searchParams.set('search', search)
  }

  if (params.status && params.status !== 'ALL') {
    searchParams.set('status', params.status)
  }

  if (params.type && params.type !== 'ALL') {
    searchParams.set('type', params.type)
  }

  return searchParams.toString()
}

function normalizeQuantity(value: number) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.round(parsed))
}

export function buildPromotionPayloadFromDraft(draft: PromotionDraft) {
  const normalized = normalizePromotionDraftForType(draft)
  const rewardType = normalized.type === 'FREE_GIFT' ? 'FREE' : normalized.rewardType
  const value = normalized.type === 'FREE_GIFT' ? 0 : Number(normalized.value || 0)

  return {
    name: normalized.name.trim(),
    status: normalized.status,
    type: normalized.type,
    rewardType,
    value,
    startsAt: normalized.startsAt ? new Date(normalized.startsAt).toISOString() : null,
    endsAt: normalized.endsAt ? new Date(normalized.endsAt).toISOString() : null,
    usageLimit: normalized.usageLimit === '' ? null : Number(normalized.usageLimit),
    priority: normalized.priority === '' ? null : Number(normalized.priority),
    qualifiers: normalized.qualifiers.map((qualifier) => ({
      variantId: qualifier.variantId,
      requiredQuantity: normalizeQuantity(qualifier.quantity),
    })),
    rewards:
      normalized.type === 'PRODUCT_GROUP_DISCOUNT'
        ? []
        : normalized.rewards.map((reward) => ({
            variantId: reward.variantId,
            rewardQuantity: normalizeQuantity(reward.quantity),
          })),
  }
}

export function formatPromotionTypeLabel(type: string) {
  if (type === 'PRODUCT_GROUP_DISCOUNT') return 'Product group discount'
  if (type === 'BUY_X_GET_Y') return 'Buy X Get Y'
  if (type === 'FREE_GIFT') return 'Free gift'
  return type
}

export function formatPromotionStatusLabel(status: string) {
  return String(status || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getPromotionStatusTone(status: string) {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SCHEDULED') return 'warning'
  if (status === 'DISABLED' || status === 'EXPIRED') return 'neutral'
  return 'info'
}

export function formatRewardSummary(input: { rewardType: string; type: string; value: number }) {
  if (input.type === 'FREE_GIFT' || input.rewardType === 'FREE') {
    return 'Free reward items'
  }

  if (input.rewardType === 'PERCENTAGE') {
    return `${input.value}% off`
  }

  return `$${Number(input.value || 0).toFixed(2)} off`
}

function summarizeNames(rows: PromotionVariantSelection[]) {
  if (!rows.length) return 'selected products'
  const names = rows.slice(0, 2).map((row) => `${row.productTitle} (${row.variantTitle})`)
  if (rows.length > 2) names.push(`+${rows.length - 2} more`)
  return names.join(', ')
}

export function buildPromotionPreview(draft: PromotionDraft) {
  const normalized = normalizePromotionDraftForType(draft)
  const buyText = summarizeNames(normalized.qualifiers)
  const rewardText = summarizeNames(normalized.rewards)
  const rewardSummary = formatRewardSummary({
    type: normalized.type,
    rewardType: normalized.rewardType,
    value: Number(normalized.value || 0),
  })

  if (normalized.type === 'PRODUCT_GROUP_DISCOUNT') {
    return `When cart contains ${buyText}, apply ${rewardSummary} to those selected products.`
  }

  if (normalized.type === 'BUY_X_GET_Y') {
    return `When cart contains ${buyText}, apply ${rewardSummary} to ${rewardText} if those reward items are also in the cart.`
  }

  return `When cart contains ${buyText}, make ${rewardText} free if those reward items are also in the cart.`
}

export function extractPromotionValidationIssues(details: unknown): PromotionValidationIssue[] {
  if (!details || typeof details !== 'object') return []

  const detailsRecord = details as Record<string, unknown>
  const rawErrors = detailsRecord.errors

  if (Array.isArray(rawErrors)) {
    return rawErrors
      .filter((error): error is Record<string, unknown> => Boolean(error && typeof error === 'object'))
      .map((error) => ({
        path: String(error.path || ''),
        code: String(error.code || 'INVALID'),
        message: String(error.message || 'Invalid promotion value'),
      }))
  }

  const fieldErrors = detailsRecord?.fieldErrors
  if (fieldErrors && typeof fieldErrors === 'object') {
    return Object.entries(fieldErrors as Record<string, unknown>)
      .flatMap(([path, messages]) =>
        Array.isArray(messages)
          ? messages.map((message) => ({
              path,
              code: 'INVALID_FIELD',
              message: String(message),
            }))
          : []
      )
      .filter((issue) => Boolean(issue.message))
  }

  return []
}

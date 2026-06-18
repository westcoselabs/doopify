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

export type PromotionCatalogSection = 'qualifiers' | 'rewards'

export type PromotionCatalogVariant = {
  id: string
  sku: string | null
  title: string
}

export type PromotionCatalogProduct = {
  fulfillmentType: string | null
  handle: string
  id: string
  status: string | null
  title: string
  variants: PromotionCatalogVariant[]
}

export type PromotionPendingSelection = {
  fulfillmentType: string
  productId: string
  productTitle: string
  sku: string | null
  variantId: string
  variantTitle: string
}

export type PromotionCatalogSectionState = {
  error: string
  eligibleResultCount: number
  hasLoaded: boolean
  lastLoadedQuery: string
  loading: boolean
  pendingSelections: PromotionPendingSelection[]
  productDetailsById: Record<string, PromotionCatalogProduct>
  query: string
  requestId: number
  rows: PromotionCatalogProduct[]
  totalResultCount: number
}

export type PromotionCatalogState = {
  openSection: PromotionCatalogSection | null
  sections: Record<PromotionCatalogSection, PromotionCatalogSectionState>
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

export type SmartPromotionListRow = {
  id: string
  method: 'Automatic'
  name: string
  raw: Record<string, unknown>
  source: 'smart-promotion'
  sourceId: string
  status: string
  statusLabel: string
  summary: string
  typeKey: string
  typeLabel: string
  updatedLabel: string
  usageLabel: string
}

type SelectionDraftSection = PromotionDraft['qualifiers'] | PromotionDraft['rewards']

type ListQueryParams = {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  type?: string
}

function normalizeCatalogQuery(query: string) {
  return String(query || '').trim()
}

function toLocalDateTimeInput(value: unknown) {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function formatFixedAmountDraftValue(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return ''
  return (parsed / 100).toFixed(2)
}

function formatPromotionUpdatedLabel(value: unknown) {
  if (!value) return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
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

export function createPromotionCatalogSectionState(): PromotionCatalogSectionState {
  return {
    query: '',
    rows: [],
    loading: false,
    error: '',
    pendingSelections: [],
    productDetailsById: {},
    hasLoaded: false,
    lastLoadedQuery: '',
    requestId: 0,
    totalResultCount: 0,
    eligibleResultCount: 0,
  }
}

export function createPromotionCatalogState(): PromotionCatalogState {
  return {
    openSection: null,
    sections: {
      qualifiers: createPromotionCatalogSectionState(),
      rewards: createPromotionCatalogSectionState(),
    },
  }
}

export function getPromotionCatalogSectionState(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection
) {
  return catalogState.sections[section]
}

export function openPromotionCatalogSection(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection
): PromotionCatalogState {
  return {
    ...catalogState,
    openSection: section,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...catalogState.sections[section],
        error: '',
        pendingSelections: [],
      },
    },
  }
}

export function closePromotionCatalogState(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection | null = catalogState.openSection
): PromotionCatalogState {
  if (!section) {
    return {
      ...catalogState,
      openSection: null,
    }
  }

  return {
    ...catalogState,
    openSection: null,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...catalogState.sections[section],
        pendingSelections: [],
      },
    },
  }
}

export function updatePromotionCatalogQuery(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  query: string
): PromotionCatalogState {
  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...catalogState.sections[section],
        query,
      },
    },
  }
}

export function togglePromotionPendingSelection(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  selection: PromotionPendingSelection
): PromotionCatalogState {
  const sectionState = catalogState.sections[section]
  const exists = sectionState.pendingSelections.some((entry) => entry.variantId === selection.variantId)

  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...sectionState,
        pendingSelections: exists
          ? sectionState.pendingSelections.filter((entry) => entry.variantId !== selection.variantId)
          : sectionState.pendingSelections.concat(selection),
      },
    },
  }
}

export function shouldLoadPromotionCatalogOnOpen(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection
) {
  const sectionState = catalogState.sections[section]
  return !sectionState.loading && !sectionState.hasLoaded && sectionState.rows.length === 0
}

export function shouldFetchPromotionCatalog(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  options?: { force?: boolean }
) {
  const sectionState = catalogState.sections[section]
  const query = normalizeCatalogQuery(sectionState.query)

  if (sectionState.loading) return false
  if (options?.force) return true
  if (!sectionState.hasLoaded) return true

  return query !== sectionState.lastLoadedQuery
}

export function beginPromotionCatalogSearch(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection
): PromotionCatalogState {
  const sectionState = catalogState.sections[section]

  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...sectionState,
        loading: true,
        error: '',
        requestId: sectionState.requestId + 1,
      },
    },
  }
}

type PromotionCatalogPayload = {
  data?: {
    product?: unknown
    products?: unknown
  } | null
  error?: string
  products?: unknown
  success?: boolean
}

type PromotionCatalogFetchResult = {
  rows: PromotionCatalogProduct[]
  totalResultCount: number
  eligibleResultCount: number
}

function normalizePromotionCatalogStatus(status: unknown) {
  const normalized = String(status || '').trim().toUpperCase()
  return normalized || null
}

function normalizePromotionCatalogFulfillmentType(fulfillmentType: unknown) {
  const normalized = String(fulfillmentType || '').trim().toUpperCase()
  return normalized || 'PHYSICAL'
}

function normalizePromotionCatalogVariant(variant: any): PromotionCatalogVariant {
  return {
    id: String(variant?.id || ''),
    sku: variant?.sku == null ? null : String(variant.sku),
    title: String(variant?.title || '').trim() || 'Default',
  }
}

function normalizePromotionCatalogProduct(product: any): PromotionCatalogProduct {
  return {
    id: String(product?.id || ''),
    title: String(product?.title || '').trim() || 'Untitled product',
    handle: String(product?.handle || '').trim(),
    status: normalizePromotionCatalogStatus(product?.status),
    fulfillmentType: normalizePromotionCatalogFulfillmentType(product?.fulfillmentType),
    variants: Array.isArray(product?.variants)
      ? product.variants
          .map((variant: unknown) => normalizePromotionCatalogVariant(variant))
          .filter((variant: PromotionCatalogVariant) => Boolean(variant.id))
      : [],
  }
}

export function isEligiblePhysicalProduct(product: Pick<PromotionCatalogProduct, 'fulfillmentType' | 'status'>) {
  const fulfillmentType = normalizePromotionCatalogFulfillmentType(product.fulfillmentType)
  const status = normalizePromotionCatalogStatus(product.status)

  return fulfillmentType === 'PHYSICAL' && status === 'ACTIVE'
}

export function getProductsFromPayload(payload: PromotionCatalogPayload): unknown[] {
  if (Array.isArray(payload?.data?.products)) {
    return payload.data.products
  }

  if (Array.isArray(payload?.products)) {
    return payload.products
  }

  return []
}

function getProductFromPayload(payload: PromotionCatalogPayload): unknown | null {
  if (payload?.data?.product && typeof payload.data.product === 'object') {
    return payload.data.product
  }

  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const maybeProduct = payload.data as Record<string, unknown>
    if (typeof maybeProduct.id === 'string') {
      return maybeProduct
    }
  }

  return null
}

async function parseJsonSafely(response: Response): Promise<PromotionCatalogPayload | null> {
  try {
    return (await response.json()) as PromotionCatalogPayload
  } catch {
    return null
  }
}

function getPromotionCatalogErrorMessage(payload: PromotionCatalogPayload | null, fallback: string) {
  if (payload?.error) {
    return String(payload.error)
  }

  return fallback
}

export function buildPromotionCatalogListUrl(query: string) {
  const searchParams = new URLSearchParams({
    page: '1',
    pageSize: '20',
    status: 'ACTIVE',
  })

  const normalizedQuery = normalizeCatalogQuery(query)
  if (normalizedQuery) {
    searchParams.set('search', normalizedQuery)
  }

  return `/api/products?${searchParams.toString()}`
}

export function buildPromotionCatalogProductDetailUrl(productId: string) {
  return `/api/products/${encodeURIComponent(productId)}`
}

export async function fetchPromotionCatalogProductDetail(
  productId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PromotionCatalogProduct | null> {
  const response = await fetchImpl(buildPromotionCatalogProductDetailUrl(productId))
  const payload = await parseJsonSafely(response)

  if (!response.ok || !payload?.success) {
    throw new Error(getPromotionCatalogErrorMessage(payload, 'Failed to load products. Try again.'))
  }

  const detailProduct = getProductFromPayload(payload)
  if (!detailProduct) {
    return null
  }

  return normalizePromotionCatalogProduct(detailProduct)
}

export async function fetchPromotionCatalogProducts(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<PromotionCatalogFetchResult> {
  const response = await fetchImpl(buildPromotionCatalogListUrl(query))
  const payload = await parseJsonSafely(response)

  if (!response.ok || !payload?.success) {
    throw new Error(getPromotionCatalogErrorMessage(payload, 'Failed to load products. Try again.'))
  }

  const payloadProducts = getProductsFromPayload(payload)
  const summaryProducts = payloadProducts.map(normalizePromotionCatalogProduct)
  const eligibleProducts = summaryProducts.filter((product) => product.id).filter(isEligiblePhysicalProduct)

  return {
    rows: eligibleProducts,
    totalResultCount: summaryProducts.length,
    eligibleResultCount: eligibleProducts.length,
  }
}

export function resolvePromotionCatalogProductDetailSuccess(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  productId: string,
  productDetail: PromotionCatalogProduct
): PromotionCatalogState {
  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...catalogState.sections[section],
        productDetailsById: {
          ...catalogState.sections[section].productDetailsById,
          [productId]: productDetail,
        },
      },
    },
  }
}

export function resolvePromotionCatalogSearchSuccess(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  rows: PromotionCatalogProduct[],
  requestId: number,
  query: string,
  counts?: {
    eligibleResultCount?: number
    totalResultCount?: number
  }
): PromotionCatalogState {
  const sectionState = catalogState.sections[section]
  if (sectionState.requestId !== requestId) return catalogState

  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...sectionState,
        rows,
        loading: false,
        error: '',
        hasLoaded: true,
        lastLoadedQuery: normalizeCatalogQuery(query),
        totalResultCount: counts?.totalResultCount ?? rows.length,
        eligibleResultCount: counts?.eligibleResultCount ?? rows.length,
      },
    },
  }
}

export function resolvePromotionCatalogSearchError(
  catalogState: PromotionCatalogState,
  section: PromotionCatalogSection,
  error: string,
  requestId: number
): PromotionCatalogState {
  const sectionState = catalogState.sections[section]
  if (sectionState.requestId !== requestId) return catalogState

  return {
    ...catalogState,
    sections: {
      ...catalogState.sections,
      [section]: {
        ...sectionState,
        loading: false,
        error,
      },
    },
  }
}

export function normalizePromotionDraftForType(draft: PromotionDraft): PromotionDraft {
  const normalizedDraft: PromotionDraft =
    draft.type !== 'FREE_GIFT' && draft.rewardType === 'FREE'
      ? {
          ...draft,
          rewardType: 'PERCENTAGE',
          value: draft.value === '0' ? '' : draft.value,
        }
      : draft

  if (normalizedDraft.type === 'FREE_GIFT') {
    return {
      ...normalizedDraft,
      rewardType: 'FREE',
      value: '0',
    }
  }

  if (normalizedDraft.type === 'PRODUCT_GROUP_DISCOUNT') {
    return {
      ...normalizedDraft,
      rewards: [],
    }
  }

  return normalizedDraft
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
  const parsedValue = Number(normalized.value || 0)
  const value =
    normalized.type === 'FREE_GIFT'
      ? 0
      : rewardType === 'FIXED_AMOUNT'
        ? Math.round(parsedValue * 100)
        : Number.isFinite(parsedValue)
          ? parsedValue
          : 0

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

export function canSubmitPromotionDraft(draft: PromotionDraft) {
  const normalized = normalizePromotionDraftForType(draft)
  if (!normalized.name.trim()) return false
  if (!normalized.qualifiers.length) return false

  if (normalized.type !== 'PRODUCT_GROUP_DISCOUNT' && !normalized.rewards.length) {
    return false
  }

  if (normalized.type !== 'FREE_GIFT') {
    const parsedValue = Number(normalized.value)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return false
  }

  return true
}

export function appendPromotionSelectionRow(
  rows: SelectionDraftSection,
  selection: Omit<PromotionVariantSelection, 'quantity'> & { quantity?: number }
) {
  if (rows.some((row) => row.variantId === selection.variantId)) {
    return rows
  }

  const nextQuantity =
    typeof selection.quantity === 'number' && Number.isFinite(selection.quantity)
      ? Math.max(1, Math.round(selection.quantity))
      : 1

  return rows.concat({
    ...selection,
    quantity: nextQuantity,
  })
}

export function toDraftFromDetail(promotion: any): PromotionDraft {
  const rewardType = (promotion?.rewardType || 'PERCENTAGE') as PromotionRewardType
  const type = (promotion?.type || 'PRODUCT_GROUP_DISCOUNT') as PromotionType
  const status = (promotion?.status || 'DRAFT') as PromotionStatus

  return normalizePromotionDraftForType({
    id: promotion?.id ? String(promotion.id) : null,
    name: String(promotion?.name || ''),
    status,
    type,
    rewardType,
    value:
      rewardType === 'FIXED_AMOUNT'
        ? formatFixedAmountDraftValue(promotion?.value)
        : String(promotion?.value ?? ''),
    startsAt: toLocalDateTimeInput(promotion?.startsAt),
    endsAt: toLocalDateTimeInput(promotion?.endsAt),
    usageLimit: promotion?.usageLimit == null ? '' : String(promotion.usageLimit),
    priority: promotion?.priority == null ? '100' : String(promotion.priority),
    qualifiers: (promotion?.qualifiers || []).map((qualifier: any) => ({
      variantId: qualifier.variantId,
      productTitle: qualifier.productTitle,
      variantTitle: qualifier.variantTitle,
      sku: qualifier.sku || null,
      fulfillmentType: qualifier.fulfillmentType || 'PHYSICAL',
      quantity: Number(qualifier.requiredQuantity || 1),
    })),
    rewards: (promotion?.rewards || []).map((reward: any) => ({
      variantId: reward.variantId,
      productTitle: reward.productTitle,
      variantTitle: reward.variantTitle,
      sku: reward.sku || null,
      fulfillmentType: reward.fulfillmentType || 'PHYSICAL',
      quantity: Number(reward.rewardQuantity || 1),
    })),
  })
}

export function mapSmartPromotionListRow(promotion: Record<string, any>): SmartPromotionListRow {
  return {
    id: `promotion-${promotion.id}`,
    source: 'smart-promotion',
    sourceId: String(promotion.id),
    name: String(promotion.name || ''),
    method: 'Automatic',
    typeLabel: formatPromotionTypeLabel(String(promotion.type || '')),
    typeKey: String(promotion.type || ''),
    status: String(promotion.status || '').toLowerCase(),
    statusLabel: formatPromotionStatusLabel(String(promotion.status || '')),
    usageLabel: `${promotion.usageCount || 0} / ${promotion.usageLimit == null ? 'No cap' : promotion.usageLimit}`,
    updatedLabel: formatPromotionUpdatedLabel(promotion.updatedAt),
    summary: formatPromotionTypeLabel(String(promotion.type || '')),
    raw: promotion,
  }
}

export async function disablePromotionById(
  promotionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ message: string }> {
  const response = await fetchImpl(`/api/promotions/${promotionId}`, { method: 'DELETE' })
  const payload = await parseJsonSafely(response)

  if (!response.ok || !payload?.success) {
    throw new Error(getPromotionCatalogErrorMessage(payload, 'Failed to disable promotion.'))
  }

  return {
    message: 'Promotion disabled',
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

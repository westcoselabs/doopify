type CredentialMetaEntry = {
  key: string
  present?: boolean
  maskedValue?: string | null
}

type StripeRuntimeProviderStatusSnapshot = {
  publishableKeyMasked?: string | null
  secretKeyMasked?: string | null
  webhookSecretMasked?: string | null
  mode?: string | null
}

type StripeRuntimeStatusSnapshot = {
  mode?: string | null
  publishableKeyMasked?: string | null
  secretKeyMasked?: string | null
  webhookSecretMasked?: string | null
  providerStatus?: StripeRuntimeProviderStatusSnapshot | null
}

export function buildMaskedCredentialMap(entries: CredentialMetaEntry[] | null | undefined) {
  const map: Record<string, string> = {}
  for (const entry of entries || []) {
    if (!entry?.key || !entry?.present || !entry.maskedValue) continue
    map[entry.key] = entry.maskedValue
  }
  return map
}

export function buildStripeMaskedCredentialMap(input: {
  credentialMeta?: CredentialMetaEntry[] | null
  runtimeStatus?: StripeRuntimeStatusSnapshot | null
  runtimeProviderStatus?: StripeRuntimeProviderStatusSnapshot | null
  runtimeMode?: string | null
}) {
  const map = buildMaskedCredentialMap(input.credentialMeta)
  const runtimeStatus = input.runtimeStatus || null
  const runtimeProviderStatus =
    input.runtimeProviderStatus || runtimeStatus?.providerStatus || runtimeStatus || {}

  if (!map.PUBLISHABLE_KEY && runtimeProviderStatus.publishableKeyMasked) {
    map.PUBLISHABLE_KEY = runtimeProviderStatus.publishableKeyMasked
  }

  if (!map.SECRET_KEY && runtimeProviderStatus.secretKeyMasked) {
    map.SECRET_KEY = runtimeProviderStatus.secretKeyMasked
  }

  if (!map.WEBHOOK_SECRET && runtimeProviderStatus.webhookSecretMasked) {
    map.WEBHOOK_SECRET = runtimeProviderStatus.webhookSecretMasked
  }

  const normalizedMode = String(
    map.MODE || runtimeProviderStatus.mode || runtimeStatus?.mode || input.runtimeMode || ''
  )
    .trim()
    .toLowerCase()
  if (normalizedMode === 'live' || normalizedMode === 'test') {
    map.MODE = normalizedMode
  }

  return map
}

export function resolveMaskedInputPlaceholder(input: {
  draftValue: string | null | undefined
  fallbackPlaceholder: string
  savedMaskedValue?: string | null
}) {
  const typedValue = String(input.draftValue || '').trim()
  if (typedValue) return input.fallbackPlaceholder

  const savedMaskedValue = String(input.savedMaskedValue || '').trim()
  if (savedMaskedValue) return savedMaskedValue

  return input.fallbackPlaceholder
}

type StripeDrawerForm = {
  publishableKey?: string | null
  secretKey?: string | null
  webhookSecret?: string | null
  mode?: string | null
  savedMaskMap?: Record<string, string> | null
}

export function resolveStripeConnectionState(input: {
  providerState?: string | null
  credentialMaskMap?: Record<string, string> | null
}) {
  const credentialMaskMap = input.credentialMaskMap || {}
  const hasSavedRequiredKeys = Boolean(credentialMaskMap.PUBLISHABLE_KEY && credentialMaskMap.SECRET_KEY)
  const normalizedProviderState = String(input.providerState || '')
    .trim()
    .toUpperCase()
  const fallbackState = hasSavedRequiredKeys ? 'CREDENTIALS_SAVED' : 'NOT_CONFIGURED'
  const rawState = normalizedProviderState || fallbackState

  if (hasSavedRequiredKeys && rawState === 'NOT_CONFIGURED') {
    return 'CREDENTIALS_SAVED'
  }

  return rawState
}

export function buildStripeCredentialSavePayload(input: StripeDrawerForm) {
  const savedMaskMap = input.savedMaskMap || {}

  const normalizeCredentialForSave = (value: string | null | undefined, savedMaskedValue: string | undefined) => {
    const normalized = String(value || '').trim()
    if (!normalized) return undefined
    if (savedMaskedValue && normalized === savedMaskedValue) return undefined

    // Defensive guard: masked values are display-only and must never be re-submitted as credentials.
    if (normalized.includes('******') || normalized.includes('••••')) return undefined

    return normalized
  }

  const publishableKey = normalizeCredentialForSave(input.publishableKey, savedMaskMap.PUBLISHABLE_KEY)
  const secretKey = normalizeCredentialForSave(input.secretKey, savedMaskMap.SECRET_KEY)
  const webhookSecret = normalizeCredentialForSave(input.webhookSecret, savedMaskMap.WEBHOOK_SECRET)
  const normalizedMode = String(input.mode || '')
    .trim()
    .toLowerCase()

  return {
    publishableKey,
    secretKey,
    webhookSecret,
    mode: normalizedMode === 'live' ? 'live' : 'test',
  }
}

export function shouldShowStripeCredentialInput(input: {
  savedMaskedValue?: string | null
  draftValue?: string | null
  isReplacing?: boolean
}) {
  const hasSavedMaskedValue = Boolean(String(input.savedMaskedValue || '').trim())
  if (!hasSavedMaskedValue) return true

  if (Boolean(input.isReplacing)) return true

  const hasDraftValue = Boolean(String(input.draftValue || '').trim())
  if (hasDraftValue) return true

  return false
}

export function shouldConfirmStripeCredentialReplacement(input: {
  replacementByField?: Record<string, boolean> | null
  payload?: Record<string, string | undefined> | null
}) {
  const replacementByField = input.replacementByField || {}
  const payload = input.payload || {}

  return (
    (Boolean(replacementByField.publishableKey) && Boolean(String(payload.publishableKey || '').trim())) ||
    (Boolean(replacementByField.secretKey) && Boolean(String(payload.secretKey || '').trim())) ||
    (Boolean(replacementByField.webhookSecret) && Boolean(String(payload.webhookSecret || '').trim()))
  )
}

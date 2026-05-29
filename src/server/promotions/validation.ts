import {
  type PromotionDraftInput,
  type PromotionRewardDefinition,
  type PromotionType,
  type PromotionValidationIssue,
  type PromotionValidationResult,
  type PromotionVariantCatalogEntry,
  PROMOTION_REWARD_TYPES,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
} from '@/server/promotions/contracts'

type PromotionValidationOptions = {
  variantCatalogById?: Record<string, PromotionVariantCatalogEntry>
}

const MAX_PERCENTAGE_VALUE = 100
const MIN_PERCENTAGE_VALUE = 1

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pushError(
  errors: PromotionValidationIssue[],
  path: string,
  code: string,
  message: string
) {
  errors.push({ path, code, message })
}

function pushWarning(
  warnings: PromotionValidationIssue[],
  path: string,
  code: string,
  message: string
) {
  warnings.push({ path, code, message })
}

function validateRewardTypeForPromotionType(
  inputType: PromotionType,
  rewardType: string,
  errors: PromotionValidationIssue[]
) {
  if (inputType === 'FREE_GIFT' && rewardType !== 'FREE') {
    pushError(
      errors,
      'rewardType',
      'INVALID_REWARD_TYPE_FOR_PROMOTION_TYPE',
      'FREE_GIFT promotions must use rewardType FREE.'
    )
  }

  if (inputType === 'PRODUCT_GROUP_DISCOUNT' && rewardType === 'FREE') {
    pushError(
      errors,
      'rewardType',
      'INVALID_REWARD_TYPE_FOR_PROMOTION_TYPE',
      'PRODUCT_GROUP_DISCOUNT promotions must use PERCENTAGE or FIXED_AMOUNT.'
    )
  }
}

function validateValue(input: PromotionDraftInput, errors: PromotionValidationIssue[]) {
  if (!isFiniteInteger(input.value)) {
    pushError(errors, 'value', 'INVALID_VALUE', 'Promotion value must be an integer.')
    return
  }

  if (input.rewardType === 'PERCENTAGE') {
    if (input.value < MIN_PERCENTAGE_VALUE || input.value > MAX_PERCENTAGE_VALUE) {
      pushError(
        errors,
        'value',
        'INVALID_VALUE',
        `Percentage reward value must be between ${MIN_PERCENTAGE_VALUE} and ${MAX_PERCENTAGE_VALUE}.`
      )
    }
    return
  }

  if (input.rewardType === 'FIXED_AMOUNT') {
    if (input.value < 1) {
      pushError(errors, 'value', 'INVALID_VALUE', 'Fixed amount reward value must be at least 1 cent.')
    }
    return
  }

  if (input.rewardType === 'FREE' && input.value !== 0) {
    pushError(errors, 'value', 'INVALID_VALUE', 'FREE reward type must use value 0.')
  }
}

function validateRowQuantities(input: PromotionDraftInput, errors: PromotionValidationIssue[]) {
  for (const [index, qualifier] of input.qualifiers.entries()) {
    if (!qualifier.variantId || !qualifier.variantId.trim()) {
      pushError(
        errors,
        `qualifiers[${index}].variantId`,
        'MISSING_VARIANT',
        'Qualifier rows must include a variantId.'
      )
    }

    if (!isFiniteInteger(qualifier.requiredQuantity) || qualifier.requiredQuantity < 1) {
      pushError(
        errors,
        `qualifiers[${index}].requiredQuantity`,
        'INVALID_REQUIRED_QUANTITY',
        'Qualifier requiredQuantity must be at least 1.'
      )
    }
  }

  for (const [index, reward] of (input.rewards ?? []).entries()) {
    if (!reward.variantId || !reward.variantId.trim()) {
      pushError(
        errors,
        `rewards[${index}].variantId`,
        'MISSING_VARIANT',
        'Reward rows must include a variantId.'
      )
    }

    if (!isFiniteInteger(reward.rewardQuantity) || reward.rewardQuantity < 1) {
      pushError(
        errors,
        `rewards[${index}].rewardQuantity`,
        'INVALID_REWARD_QUANTITY',
        'Reward quantity must be at least 1.'
      )
    }
  }
}

function collectDuplicateVariantIds(
  rows: Array<{ variantId: string }>,
  rowPath: string,
  errors: PromotionValidationIssue[]
) {
  const seen = new Set<string>()
  for (const [index, row] of rows.entries()) {
    const variantId = row.variantId?.trim()
    if (!variantId) continue
    if (seen.has(variantId)) {
      pushError(
        errors,
        `${rowPath}[${index}].variantId`,
        'DUPLICATE_VARIANT',
        `Variant ${variantId} appears more than once in ${rowPath}.`
      )
      continue
    }
    seen.add(variantId)
  }
}

function validateCrossListAmbiguity(
  input: PromotionDraftInput,
  errors: PromotionValidationIssue[]
) {
  if (input.type === 'PRODUCT_GROUP_DISCOUNT') return

  const qualifierIds = new Set(input.qualifiers.map((row) => row.variantId.trim()))
  for (const [index, reward] of (input.rewards ?? []).entries()) {
    const variantId = reward.variantId.trim()
    if (qualifierIds.has(variantId)) {
      pushError(
        errors,
        `rewards[${index}].variantId`,
        'AMBIGUOUS_VARIANT_ROLE',
        'Reward variants cannot also be qualifier variants for this promotion type in V1.'
      )
    }
  }
}

function validateDigitalRestrictions(
  input: PromotionDraftInput,
  options: PromotionValidationOptions,
  errors: PromotionValidationIssue[],
  warnings: PromotionValidationIssue[]
) {
  const catalog = options.variantCatalogById
  if (!catalog) {
    pushWarning(
      warnings,
      'variantCatalogById',
      'PHYSICAL_ONLY_NOT_VERIFIED',
      'Physical-only validation was skipped because variant catalog context was not provided.'
    )
    return
  }

  const allRows: Array<{ path: string; variantId: string }> = [
    ...input.qualifiers.map((row, index) => ({ path: `qualifiers[${index}]`, variantId: row.variantId })),
    ...(input.rewards ?? []).map((row, index) => ({ path: `rewards[${index}]`, variantId: row.variantId })),
  ]

  for (const row of allRows) {
    const variantId = row.variantId.trim()
    const entry = catalog[variantId]
    if (!entry) {
      pushError(
        errors,
        `${row.path}.variantId`,
        'UNKNOWN_VARIANT',
        `Variant ${variantId} was not found in the provided catalog context.`
      )
      continue
    }

    if (entry.fulfillmentType === 'DIGITAL') {
      pushError(
        errors,
        `${row.path}.variantId`,
        'DIGITAL_VARIANT_NOT_ALLOWED',
        'Digital products are not eligible for Smart Promotions V1.'
      )
    }
  }
}

function shouldRequireRewards(type: PromotionType) {
  return type === 'BUY_X_GET_Y' || type === 'FREE_GIFT'
}

function validateRewardPresence(
  type: PromotionType,
  rewards: PromotionRewardDefinition[],
  errors: PromotionValidationIssue[]
) {
  if (shouldRequireRewards(type) && rewards.length === 0) {
    pushError(
      errors,
      'rewards',
      'MISSING_REWARDS',
      'Buy X Get Y and Free Gift promotions require at least one reward variant.'
    )
  }
}

export function validatePromotionDraft(
  input: PromotionDraftInput,
  options: PromotionValidationOptions = {}
): PromotionValidationResult {
  const errors: PromotionValidationIssue[] = []
  const warnings: PromotionValidationIssue[] = []

  if (!input.name || !input.name.trim()) {
    pushError(errors, 'name', 'MISSING_NAME', 'Promotion name is required.')
  }

  if (!PROMOTION_TYPES.includes(input.type)) {
    pushError(errors, 'type', 'INVALID_TYPE', 'Promotion type is invalid.')
  }

  if (!PROMOTION_REWARD_TYPES.includes(input.rewardType)) {
    pushError(errors, 'rewardType', 'INVALID_REWARD_TYPE', 'Promotion reward type is invalid.')
  }

  if (input.status && !PROMOTION_STATUSES.includes(input.status)) {
    pushError(errors, 'status', 'INVALID_STATUS', 'Promotion status is invalid.')
  }

  if (!Array.isArray(input.qualifiers) || input.qualifiers.length === 0) {
    pushError(errors, 'qualifiers', 'MISSING_QUALIFIERS', 'At least one qualifier variant is required.')
  }

  const rewards = input.rewards ?? []
  validateRewardPresence(input.type, rewards, errors)
  validateRewardTypeForPromotionType(input.type, input.rewardType, errors)
  validateValue(input, errors)
  validateRowQuantities(input, errors)
  collectDuplicateVariantIds(input.qualifiers, 'qualifiers', errors)
  collectDuplicateVariantIds(rewards, 'rewards', errors)
  validateCrossListAmbiguity(input, errors)

  if (input.usageLimit != null) {
    if (!isFiniteInteger(input.usageLimit) || input.usageLimit < 1) {
      pushError(errors, 'usageLimit', 'INVALID_USAGE_LIMIT', 'usageLimit must be at least 1 when provided.')
    }
  }

  const startsAt = parseDate(input.startsAt)
  const endsAt = parseDate(input.endsAt)

  if (input.startsAt && !startsAt) {
    pushError(errors, 'startsAt', 'INVALID_DATE', 'startsAt must be a valid date.')
  }

  if (input.endsAt && !endsAt) {
    pushError(errors, 'endsAt', 'INVALID_DATE', 'endsAt must be a valid date.')
  }

  if (startsAt && endsAt && startsAt > endsAt) {
    pushError(errors, 'startsAt', 'INVALID_DATE_RANGE', 'startsAt cannot be after endsAt.')
  }

  validateDigitalRestrictions(input, options, errors, warnings)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

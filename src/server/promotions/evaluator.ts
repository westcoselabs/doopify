import {
  type PromotionApplicationDraft,
  type PromotionCartLine,
  type PromotionDefinition,
  type PromotionEvaluationInput,
  type PromotionEvaluationOptions,
  type PromotionEvaluationResult,
  type PromotionEvaluationSkip,
  type PromotionLineAllocation,
} from '@/server/promotions/contracts'
import {
  MAX_AUTOMATIC_PROMOTIONS_PER_CHECKOUT,
  SMART_PROMOTIONS_PHYSICAL_ONLY,
  SMART_PROMOTIONS_STACK_POLICY_V1,
} from '@/server/promotions/policies'

type PromotionTargetLine = {
  variantId: string
  quantityDiscounted: number
  eligibleSubtotalCents: number
}

type PromotionCandidate = {
  promotion: PromotionDefinition
  draft: PromotionApplicationDraft
}

type LineLookup = Record<string, PromotionCartLine>

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toLineLookup(cartLines: PromotionCartLine[]): LineLookup {
  const lookup: LineLookup = {}
  for (const line of cartLines) {
    if (!lookup[line.variantId]) {
      lookup[line.variantId] = line
      continue
    }

    // Defensive: merge duplicate variant lines in a deterministic way.
    lookup[line.variantId] = {
      ...lookup[line.variantId],
      quantity: lookup[line.variantId].quantity + line.quantity,
    }
  }
  return lookup
}

function buildSkip(
  promotion: PromotionDefinition,
  reason: PromotionEvaluationSkip['reason'],
  message: string
): PromotionEvaluationSkip {
  return {
    promotionId: promotion.id,
    promotionName: promotion.name,
    reason,
    message,
  }
}

function hasCodeDiscount(input: PromotionEvaluationInput, options: PromotionEvaluationOptions) {
  if (options.codeDiscountApplied != null) return options.codeDiscountApplied
  return Boolean(input.discountCode?.trim())
}

function resolveSetsFromQualifiers(promotion: PromotionDefinition, linesByVariant: LineLookup) {
  let sets = Number.MAX_SAFE_INTEGER

  for (const qualifier of promotion.qualifiers) {
    const line = linesByVariant[qualifier.variantId]
    if (!line || line.quantity < qualifier.requiredQuantity) {
      return { ok: false as const, sets: 0 }
    }
    sets = Math.min(sets, Math.floor(line.quantity / qualifier.requiredQuantity))
  }

  if (!Number.isFinite(sets) || sets < 1) {
    return { ok: false as const, sets: 0 }
  }

  return { ok: true as const, sets }
}

function hasDigitalLine(
  linesByVariant: LineLookup,
  variantIds: string[]
) {
  for (const variantId of variantIds) {
    const line = linesByVariant[variantId]
    if (line?.fulfillmentType === 'DIGITAL') return true
  }
  return false
}

function buildTargets(
  promotion: PromotionDefinition,
  sets: number,
  linesByVariant: LineLookup
): { ok: true; targets: PromotionTargetLine[] } | { ok: false; reason: PromotionEvaluationSkip['reason']; message: string } {
  const rows =
    promotion.type === 'PRODUCT_GROUP_DISCOUNT'
      ? promotion.rewards.length
        ? promotion.rewards.map((row) => ({ variantId: row.variantId, qtyPerSet: row.rewardQuantity }))
        : promotion.qualifiers.map((row) => ({ variantId: row.variantId, qtyPerSet: row.requiredQuantity }))
      : promotion.rewards.map((row) => ({ variantId: row.variantId, qtyPerSet: row.rewardQuantity }))

  const requiresRewards = promotion.type === 'BUY_X_GET_Y' || promotion.type === 'FREE_GIFT'
  if (requiresRewards && promotion.rewards.length === 0) {
    return {
      ok: false,
      reason: 'MISSING_REWARDS',
      message: 'Promotion requires reward variants but none were configured.',
    }
  }

  const targets: PromotionTargetLine[] = []
  for (const row of rows) {
    const line = linesByVariant[row.variantId]
    if (!line) {
      if (requiresRewards || promotion.rewards.length > 0) {
        return {
          ok: false,
          reason: 'MISSING_REWARDS',
          message: `Reward variant ${row.variantId} is not present in the cart.`,
        }
      }
      continue
    }

    const eligibleQuantity = Math.min(line.quantity, row.qtyPerSet * sets)
    if (eligibleQuantity <= 0) continue

    const eligibleSubtotalCents = eligibleQuantity * line.unitPriceCents
    if (eligibleSubtotalCents <= 0) continue

    targets.push({
      variantId: row.variantId,
      quantityDiscounted: eligibleQuantity,
      eligibleSubtotalCents,
    })
  }

  if (!targets.length) {
    return {
      ok: false,
      reason: 'NO_ELIGIBLE_TARGET_LINES',
      message: 'No eligible target lines were found for this promotion.',
    }
  }

  return { ok: true, targets }
}

function allocateByPercentage(
  promotion: PromotionDefinition,
  targets: PromotionTargetLine[]
) {
  const totalEligibleCents = targets.reduce((sum, target) => sum + target.eligibleSubtotalCents, 0)
  const totalDiscountCents = Math.min(
    totalEligibleCents,
    Math.round((totalEligibleCents * promotion.value) / 100)
  )

  if (totalDiscountCents <= 0) return { totalDiscountCents: 0, allocations: [] as PromotionLineAllocation[] }

  const sorted = [...targets].sort((a, b) => a.variantId.localeCompare(b.variantId))
  const floors = sorted.map((target) => {
    const raw = (totalDiscountCents * target.eligibleSubtotalCents) / totalEligibleCents
    const floor = Math.floor(raw)
    return {
      target,
      floor,
      fraction: raw - floor,
    }
  })

  const flooredTotal = floors.reduce((sum, entry) => sum + entry.floor, 0)
  let remainder = totalDiscountCents - flooredTotal
  const ranked = [...floors].sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction
    return a.target.variantId.localeCompare(b.target.variantId)
  })

  const byVariant = new Map<string, number>()
  for (const entry of floors) {
    byVariant.set(entry.target.variantId, entry.floor)
  }

  for (const entry of ranked) {
    if (remainder <= 0) break
    byVariant.set(entry.target.variantId, (byVariant.get(entry.target.variantId) ?? 0) + 1)
    remainder -= 1
  }

  const allocations = sorted
    .map((target) => {
      const discountCents = Math.min(byVariant.get(target.variantId) ?? 0, target.eligibleSubtotalCents)
      if (discountCents <= 0) return null
      return toAllocation(promotion, target, discountCents)
    })
    .filter((allocation): allocation is PromotionLineAllocation => allocation != null)

  return { totalDiscountCents, allocations }
}

function allocateByFixedAmount(
  promotion: PromotionDefinition,
  targets: PromotionTargetLine[]
) {
  const totalEligibleCents = targets.reduce((sum, target) => sum + target.eligibleSubtotalCents, 0)
  const totalDiscountCents = Math.min(promotion.value, totalEligibleCents)
  if (totalDiscountCents <= 0) return { totalDiscountCents: 0, allocations: [] as PromotionLineAllocation[] }

  // Deterministic allocation for fixed discounts: stable variantId order with per-line caps.
  const sorted = [...targets].sort((a, b) => a.variantId.localeCompare(b.variantId))
  let remaining = totalDiscountCents
  const allocations: PromotionLineAllocation[] = []

  for (const target of sorted) {
    if (remaining <= 0) break
    const discountCents = Math.min(target.eligibleSubtotalCents, remaining)
    if (discountCents <= 0) continue
    allocations.push(toAllocation(promotion, target, discountCents))
    remaining -= discountCents
  }

  return { totalDiscountCents, allocations }
}

function allocateFreeReward(
  promotion: PromotionDefinition,
  targets: PromotionTargetLine[]
) {
  const totalDiscountCents = targets.reduce((sum, target) => sum + target.eligibleSubtotalCents, 0)
  const allocations = targets
    .map((target) => {
      if (target.eligibleSubtotalCents <= 0) return null
      return toAllocation(promotion, target, target.eligibleSubtotalCents)
    })
    .filter((allocation): allocation is PromotionLineAllocation => allocation != null)
    .sort((a, b) => a.variantId.localeCompare(b.variantId))

  return { totalDiscountCents, allocations }
}

function toAllocation(
  promotion: PromotionDefinition,
  target: PromotionTargetLine,
  discountCents: number
): PromotionLineAllocation {
  return {
    variantId: target.variantId,
    quantityDiscounted: target.quantityDiscounted,
    discountCents,
    promotionId: promotion.id,
    promotionName: promotion.name,
    promotionType: promotion.type,
    // Backward-compatible aliases
    quantity: target.quantityDiscounted,
    amountCents: discountCents,
  }
}

function evaluateCandidate(
  promotion: PromotionDefinition,
  linesByVariant: LineLookup,
  now: Date,
  options: PromotionEvaluationOptions
): { candidate: PromotionCandidate } | { skip: PromotionEvaluationSkip } {
  if (promotion.status !== 'ACTIVE') {
    return { skip: buildSkip(promotion, 'INACTIVE_STATUS', `Promotion status ${promotion.status} is not ACTIVE.`) }
  }

  const startsAt = parseDate(promotion.startsAt)
  if (startsAt && startsAt > now) {
    return { skip: buildSkip(promotion, 'NOT_STARTED', 'Promotion start date has not been reached.') }
  }

  const endsAt = parseDate(promotion.endsAt)
  if (endsAt && endsAt < now) {
    return { skip: buildSkip(promotion, 'EXPIRED', 'Promotion end date has passed.') }
  }

  if (promotion.usageLimit != null && promotion.usageCount >= promotion.usageLimit) {
    return { skip: buildSkip(promotion, 'USAGE_LIMIT_REACHED', 'Promotion usage limit has been reached.') }
  }

  const overlapExists = promotion.type !== 'PRODUCT_GROUP_DISCOUNT'
    && promotion.rewards.some((reward) => promotion.qualifiers.some((qualifier) => qualifier.variantId === reward.variantId))
  if (overlapExists) {
    return {
      skip: buildSkip(
        promotion,
        'AMBIGUOUS_VARIANT_ROLE',
        'Reward and qualifier variants cannot overlap for Buy X Get Y or Free Gift in V1.'
      ),
    }
  }

  const qualifierSets = resolveSetsFromQualifiers(promotion, linesByVariant)
  if (!qualifierSets.ok) {
    return { skip: buildSkip(promotion, 'MISSING_QUALIFIERS', 'Cart does not satisfy qualifier quantities.') }
  }

  const enforcePhysicalOnly = options.physicalOnly ?? SMART_PROMOTIONS_PHYSICAL_ONLY
  if (enforcePhysicalOnly) {
    const involvedVariantIds = [
      ...promotion.qualifiers.map((row) => row.variantId),
      ...promotion.rewards.map((row) => row.variantId),
    ]
    if (hasDigitalLine(linesByVariant, involvedVariantIds)) {
      return {
        skip: buildSkip(
          promotion,
          'PHYSICAL_ONLY_RESTRICTION',
          'Digital cart lines are not eligible for Smart Promotions V1.'
        ),
      }
    }
  }

  const targetResult = buildTargets(promotion, qualifierSets.sets, linesByVariant)
  if (!targetResult.ok) {
    return { skip: buildSkip(promotion, targetResult.reason, targetResult.message) }
  }

  const allocationResult =
    promotion.rewardType === 'PERCENTAGE'
      ? allocateByPercentage(promotion, targetResult.targets)
      : promotion.rewardType === 'FIXED_AMOUNT'
        ? allocateByFixedAmount(promotion, targetResult.targets)
        : allocateFreeReward(promotion, targetResult.targets)

  if (allocationResult.totalDiscountCents <= 0 || allocationResult.allocations.length === 0) {
    return { skip: buildSkip(promotion, 'ZERO_DISCOUNT', 'Promotion produced no discount after caps.') }
  }

  const draft: PromotionApplicationDraft = {
    promotionId: promotion.id,
    promotionName: promotion.name,
    promotionType: promotion.type,
    rewardType: promotion.rewardType,
    amountCents: allocationResult.totalDiscountCents,
    lineAllocations: allocationResult.allocations,
    summary: `${promotion.name} applied`,
  }

  return { candidate: { promotion, draft } }
}

function compareCandidates(a: PromotionCandidate, b: PromotionCandidate) {
  if (a.draft.amountCents !== b.draft.amountCents) {
    return b.draft.amountCents - a.draft.amountCents
  }
  if (a.promotion.priority !== b.promotion.priority) {
    // Lower priority number wins (e.g. priority 1 outranks 100).
    return a.promotion.priority - b.promotion.priority
  }
  return a.promotion.id.localeCompare(b.promotion.id)
}

export function evaluatePromotions(
  input: PromotionEvaluationInput,
  options: PromotionEvaluationOptions = {}
): PromotionEvaluationResult {
  const now = options.now ?? input.now ?? new Date()
  const combineWithCodeDiscounts =
    options.combineWithCodeDiscounts ?? SMART_PROMOTIONS_STACK_POLICY_V1.combineWithCodeDiscounts
  const maxAutomaticPromotions =
    options.maxAutomaticPromotionsPerCheckout ?? MAX_AUTOMATIC_PROMOTIONS_PER_CHECKOUT

  const blockedByCodeDiscount = hasCodeDiscount(input, options) && !combineWithCodeDiscounts
  if (blockedByCodeDiscount) {
    const skippedPromotions = input.promotions.map((promotion) =>
      buildSkip(
        promotion,
        'BLOCKED_BY_CODE_DISCOUNT',
        'Automatic promotions do not combine with code discounts in V1.'
      )
    )
    return {
      appliedPromotions: [],
      totalDiscountCents: 0,
      skippedPromotionIds: skippedPromotions.map((skip) => skip.promotionId),
      blockedByCodeDiscount: true,
      skippedPromotions,
      warnings: [],
    }
  }

  if (!input.promotions.length || !input.cartLines.length) {
    return {
      appliedPromotions: [],
      totalDiscountCents: 0,
      skippedPromotionIds: [],
      blockedByCodeDiscount: false,
      skippedPromotions: [],
      warnings: [],
    }
  }

  const linesByVariant = toLineLookup(input.cartLines)
  const candidates: PromotionCandidate[] = []
  const skippedPromotions: PromotionEvaluationSkip[] = []

  for (const promotion of input.promotions) {
    const result = evaluateCandidate(promotion, linesByVariant, now, options)
    if ('skip' in result) {
      skippedPromotions.push(result.skip)
      continue
    }
    candidates.push(result.candidate)
  }

  if (!candidates.length) {
    return {
      appliedPromotions: [],
      totalDiscountCents: 0,
      skippedPromotionIds: skippedPromotions.map((skip) => skip.promotionId),
      blockedByCodeDiscount: false,
      skippedPromotions,
      warnings: [],
    }
  }

  const ranked = [...candidates].sort(compareCandidates)
  const appliedPromotions = ranked.slice(0, Math.max(0, maxAutomaticPromotions)).map((candidate) => candidate.draft)

  const selectedPromotionIds = new Set(appliedPromotions.map((promotion) => promotion.promotionId))
  const skippedEligible = ranked
    .filter((candidate) => !selectedPromotionIds.has(candidate.promotion.id))
    .map((candidate) =>
      buildSkip(
        candidate.promotion,
        'NOT_SELECTED_BETTER_PROMOTION',
        'A higher-value or higher-priority promotion was selected.'
      )
    )

  const allSkipped = [...skippedPromotions, ...skippedEligible]
  const totalDiscountCents = appliedPromotions.reduce((sum, promotion) => sum + promotion.amountCents, 0)

  return {
    appliedPromotions,
    totalDiscountCents,
    skippedPromotionIds: allSkipped.map((skip) => skip.promotionId),
    blockedByCodeDiscount: false,
    skippedPromotions: allSkipped,
    warnings: [],
  }
}

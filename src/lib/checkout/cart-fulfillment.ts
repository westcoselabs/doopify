export type CartFulfillmentType = 'PHYSICAL' | 'DIGITAL'

export type CartFulfillmentClassification =
  | 'EMPTY'
  | 'PHYSICAL_ONLY'
  | 'DIGITAL_ONLY'
  | 'MIXED'

export function normalizeCartFulfillmentType(value: string | null | undefined): CartFulfillmentType {
  return String(value || '').trim().toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL'
}

export function classifyCartFulfillment(
  items: Array<{ fulfillmentType?: string | null }> | null | undefined
): CartFulfillmentClassification {
  if (!items?.length) return 'EMPTY'

  let hasPhysical = false
  let hasDigital = false

  for (const item of items) {
    const fulfillmentType = normalizeCartFulfillmentType(item?.fulfillmentType)
    if (fulfillmentType === 'DIGITAL') {
      hasDigital = true
    } else {
      hasPhysical = true
    }
  }

  if (hasPhysical && hasDigital) return 'MIXED'
  if (hasDigital) return 'DIGITAL_ONLY'
  return 'PHYSICAL_ONLY'
}


type OptionValue = {
  value?: unknown
}

type StorefrontOption = {
  name?: unknown
  values?: OptionValue[] | null
}

type VariantLike = {
  title?: unknown
  optionValues?: unknown
}

const TITLE_SEPARATORS = [' / ', '/', ' /', '/ '] as const

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeOptionValuesInput(input: unknown) {
  if (!input) return null

  const mapped: Record<string, string> = {}

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue
      const name = normalizeText((entry as { name?: unknown }).name)
      const value = normalizeText((entry as { value?: unknown }).value)
      if (!name || !value) continue
      mapped[name] = value
    }
    return Object.keys(mapped).length ? mapped : null
  }

  if (typeof input === 'object') {
    for (const [rawName, rawValue] of Object.entries(input as Record<string, unknown>)) {
      const name = normalizeText(rawName)
      const value = normalizeText(rawValue)
      if (!name || !value) continue
      mapped[name] = value
    }
    return Object.keys(mapped).length ? mapped : null
  }

  return null
}

function normalizeOptions(options: StorefrontOption[]) {
  return options
    .map((option) => {
      const name = normalizeText(option?.name)
      if (!name) return null

      const values = Array.from(
        new Set(
          (option?.values || [])
            .map((value) => normalizeText(value?.value))
            .filter(Boolean)
        )
      ).sort((a, b) => b.length - a.length)

      return values.length ? { name, values } : null
    })
    .filter((option): option is { name: string; values: string[] } => Boolean(option))
}

export function parseVariantOptionValuesFromTitle(
  title: unknown,
  options: StorefrontOption[]
) {
  const normalizedTitle = normalizeText(title)
  if (!normalizedTitle) return null

  const normalizedOptions = normalizeOptions(options)
  if (!normalizedOptions.length) return null

  const memo = new Map<string, Record<string, string> | null>()

  const walk = (optionIndex: number, cursor: number): Record<string, string> | null => {
    const memoKey = `${optionIndex}:${cursor}`
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null
    }

    if (optionIndex >= normalizedOptions.length) {
      const done = cursor === normalizedTitle.length ? {} : null
      memo.set(memoKey, done)
      return done
    }

    const option = normalizedOptions[optionIndex]
    if (!option) {
      memo.set(memoKey, null)
      return null
    }

    for (const candidateValue of option.values) {
      if (!normalizedTitle.startsWith(candidateValue, cursor)) {
        continue
      }

      const nextCursor = cursor + candidateValue.length
      const isLastOption = optionIndex === normalizedOptions.length - 1

      if (isLastOption) {
        if (nextCursor === normalizedTitle.length) {
          const result = { [option.name]: candidateValue }
          memo.set(memoKey, result)
          return result
        }
        continue
      }

      for (const separator of TITLE_SEPARATORS) {
        if (!normalizedTitle.startsWith(separator, nextCursor)) {
          continue
        }

        const remainder = walk(optionIndex + 1, nextCursor + separator.length)
        if (!remainder) continue

        const result = {
          [option.name]: candidateValue,
          ...remainder,
        }
        memo.set(memoKey, result)
        return result
      }
    }

    memo.set(memoKey, null)
    return null
  }

  return walk(0, 0)
}

export function getVariantOptionValues(
  variant: VariantLike,
  options: StorefrontOption[]
) {
  const normalizedOptions = normalizeOptions(options)
  if (!normalizedOptions.length) return null

  const structuredValues = normalizeOptionValuesInput(variant?.optionValues)
  if (structuredValues) {
    let complete = true
    const resolved: Record<string, string> = {}

    for (const option of normalizedOptions) {
      const structuredValue = normalizeText(structuredValues[option.name])
      if (!structuredValue) {
        complete = false
        break
      }
      resolved[option.name] = structuredValue
    }

    if (complete) {
      return resolved
    }
  }

  return parseVariantOptionValuesFromTitle(variant?.title, options)
}

function normalizeSelectedOptions(
  selectedOptions: Record<string, unknown>,
  options: StorefrontOption[]
) {
  const normalizedOptions = normalizeOptions(options)
  const selectedByName: Record<string, string> = {}

  for (const option of normalizedOptions) {
    selectedByName[option.name] = normalizeText(selectedOptions?.[option.name])
  }

  return selectedByName
}

function variantMatchesSelected(
  variant: VariantLike,
  options: StorefrontOption[],
  selectedByName: Record<string, string>
) {
  const optionValues = getVariantOptionValues(variant, options)
  if (!optionValues) return false

  for (const [optionName, selectedValue] of Object.entries(selectedByName)) {
    if (!selectedValue) return false
    if (normalizeText(optionValues[optionName]) !== selectedValue) return false
  }

  return true
}

export function findVariantBySelectedOptions<TVariant extends VariantLike>(input: {
  variants: TVariant[]
  options: StorefrontOption[]
  selectedOptions: Record<string, unknown>
}) {
  const { variants, options, selectedOptions } = input
  if (!variants.length) return null
  if (!options.length) return variants[0] ?? null

  const selectedByName = normalizeSelectedOptions(selectedOptions, options)
  const matched = variants.find((variant) =>
    variantMatchesSelected(variant, options, selectedByName)
  )

  return matched ?? null
}

export function isVariantValueSelectable<TVariant extends VariantLike>(input: {
  variants: TVariant[]
  options: StorefrontOption[]
  selectedOptions: Record<string, unknown>
  optionName: string
  optionValue: string
}) {
  const nextSelected = {
    ...input.selectedOptions,
    [input.optionName]: input.optionValue,
  }

  return Boolean(
    findVariantBySelectedOptions({
      variants: input.variants,
      options: input.options,
      selectedOptions: nextSelected,
    })
  )
}

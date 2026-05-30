export type CheckoutDiscountApplication = {
  code?: string
  title?: string
}

export type CheckoutPromotionApplication = {
  amount?: number
  amountCents?: number
  name?: string
  promotionName?: string
}

export type CheckoutSummaryDiscountInput = {
  codeDiscountAmount?: number
  codeDiscountAmountCents?: number
  discountAmount?: number
  discountAmountCents?: number
  discountApplications?: CheckoutDiscountApplication[]
  promotionApplications?: CheckoutPromotionApplication[]
  promotionDiscountAmount?: number
  promotionDiscountAmountCents?: number
}

export type CheckoutDiscountRow = {
  amount: number
  key: 'code' | 'promotion' | 'total'
  label: string
}

function centsToAmount(value: number | undefined) {
  return typeof value === 'number' ? value / 100 : undefined
}

function resolveAmount(input: { amount?: number; amountCents?: number }) {
  if (typeof input.amount === 'number') return input.amount
  const fromCents = centsToAmount(input.amountCents)
  return typeof fromCents === 'number' ? fromCents : 0
}

function firstPromotionName(applications: CheckoutPromotionApplication[] = []) {
  const first = applications.find((application) => {
    const name = String(application.promotionName || application.name || '').trim()
    return Boolean(name)
  })

  if (!first) return ''
  return String(first.promotionName || first.name || '').trim()
}

export function buildCheckoutDiscountRows(input: CheckoutSummaryDiscountInput): CheckoutDiscountRow[] {
  const codeDiscountAmount = Math.max(
    0,
    resolveAmount({
      amount: input.codeDiscountAmount,
      amountCents: input.codeDiscountAmountCents,
    })
  )
  const promotionDiscountAmount = Math.max(
    0,
    resolveAmount({
      amount: input.promotionDiscountAmount,
      amountCents: input.promotionDiscountAmountCents,
    })
  )
  const totalDiscountAmount = Math.max(
    0,
    resolveAmount({
      amount: input.discountAmount,
      amountCents: input.discountAmountCents,
    })
  )

  const hasBreakdown = codeDiscountAmount > 0 || promotionDiscountAmount > 0
  if (!hasBreakdown) {
    return totalDiscountAmount > 0
      ? [{ key: 'total', label: 'Discount', amount: totalDiscountAmount }]
      : []
  }

  const rows: CheckoutDiscountRow[] = []
  const codeLabel = (() => {
    const code = String(input.discountApplications?.[0]?.code || '').trim()
    return code ? `Code discount (${code})` : 'Code discount'
  })()
  const promotionName = firstPromotionName(input.promotionApplications)
  const promotionLabel = promotionName || 'Automatic promotion'

  if (codeDiscountAmount > 0) {
    rows.push({
      key: 'code',
      label: codeLabel,
      amount: codeDiscountAmount,
    })
  }

  if (promotionDiscountAmount > 0) {
    rows.push({
      key: 'promotion',
      label: promotionLabel,
      amount: promotionDiscountAmount,
    })
  }

  if (totalDiscountAmount > 0) {
    rows.push({
      key: 'total',
      label: 'Total discounts',
      amount: totalDiscountAmount,
    })
  }

  return rows
}

export function buildCheckoutPromotionHighlights(input: CheckoutSummaryDiscountInput) {
  const applications = Array.isArray(input.promotionApplications) ? input.promotionApplications : []
  return applications
    .map((application, index) => {
      const label = String(application.promotionName || application.name || '').trim() || 'Automatic promotion applied'
      const amount = Math.max(
        0,
        resolveAmount({
          amount: application.amount,
          amountCents: application.amountCents,
        })
      )

      return {
        id: `${label}-${index}`,
        label,
        amount,
      }
    })
    .filter((entry) => entry.amount > 0)
}

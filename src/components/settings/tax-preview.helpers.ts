import { calculateTax } from '@/lib/checkout/pricing'

type TaxSettingsInput = {
  enabled: boolean
  strategy?: 'NONE' | 'MANUAL'
  defaultTaxRatePercent?: string | number
  taxShipping: boolean
  pricesIncludeTax?: boolean
}
type TaxPreviewInput = { subtotal: string | number; shippingAmount?: string | number; country: string; province?: string }

function cents(value: string | number | undefined, label: string) {
  const amount = value === '' || value == null ? 0 : Number(value)
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error(label + ' must be a valid number greater than or equal to 0.')
  }
  return Math.round(amount * 100)
}

export function calculateTaxPreview(preview: TaxPreviewInput, settings: TaxSettingsInput, _legacyRules: unknown[] = []) {
  const subtotalCents = cents(preview.subtotal, 'Subtotal')
  const shippingCents = cents(preview.shippingAmount, 'Shipping amount')
  if (!preview.country.trim()) throw new Error('Destination country is required.')
  const rate = Number(settings.defaultTaxRatePercent || 0)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Tax rate must be between 0 and 100%.')
  const tax = calculateTax({
    taxableSubtotalCents: subtotalCents,
    shippingAmountCents: shippingCents,
    shippingAddress: { country: preview.country, province: preview.province },
    taxSettings: { ...settings, strategy: settings.strategy ?? 'NONE', defaultTaxRateBps: Math.round(rate * 100) },
  })
  return {
    subtotal: subtotalCents / 100,
    shippingAmount: shippingCents / 100,
    taxableBase: (tax.taxableAmountCents ?? 0) / 100,
    estimatedTax: tax.amountCents / 100,
    totalWithTax: (subtotalCents + shippingCents + (settings.pricesIncludeTax ? 0 : tax.amountCents)) / 100,
    sourceUsed: tax.label ?? 'Tax disabled',
    note: tax.source === 'none' ? 'Tax collection is off.' : settings.pricesIncludeTax ? 'Tax is included in the total.' : 'Flat manual rate applied.',
  }
}

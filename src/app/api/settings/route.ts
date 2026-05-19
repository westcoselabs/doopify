import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { centsToDollars, dollarsToCents } from '@/lib/money'
import { SUPPORTED_STORE_CURRENCIES, SUPPORTED_STORE_TIMEZONES } from '@/lib/store-settings-options'
import { requireAdmin } from '@/server/auth/require-auth'
import { withRouteTiming } from '@/server/observability/timing'
import { getStoreSettingsLite, updateStoreSettings } from '@/server/services/settings.service'

export async function GET(req: Request) {
  return withRouteTiming('GET /api/settings', req, async ({ step }) => {
    const auth = await requireAdmin(req)
    step('auth')
    if (!auth.ok) return auth.response

    try {
      const store = await getStoreSettingsLite()
      step('load_settings')
      if (!store) return err('Store not configured', 404)

      return ok({
        ...store,
        shippingThreshold: store.shippingThresholdCents == null ? null : centsToDollars(store.shippingThresholdCents),
        shippingDomesticRate: centsToDollars(store.shippingDomesticRateCents),
        shippingInternationalRate: centsToDollars(store.shippingInternationalRateCents),
        defaultTaxRatePercent: Number(store.defaultTaxRateBps || 0) / 100,
      })
    } catch (e) {
      console.error('[GET /api/settings]', e)
      return err('Failed to fetch settings', 500)
    }
  })
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  domain: z.string().optional(),
  currency: z.enum(SUPPORTED_STORE_CURRENCIES).optional(),
  timezone: z.enum(SUPPORTED_STORE_TIMEZONES).optional(),
  logoUrl: z.union([z.string().url(), z.literal('')]).optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  address1: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  shippingThreshold: z.number().optional(),
  shippingDomesticRate: z.number().min(0).optional(),
  shippingInternationalRate: z.number().min(0).optional(),
  domesticTaxRate: z.number().min(0).max(1).optional(),
  internationalTaxRate: z.number().min(0).max(1).optional(),
  taxEnabled: z.boolean().optional(),
  taxStrategy: z.enum(['NONE', 'MANUAL']).optional(),
  defaultTaxRatePercent: z.number().min(0).max(100).optional(),
  taxShipping: z.boolean().optional(),
  pricesIncludeTax: z.boolean().optional(),
  taxOriginCountry: z.string().max(3).nullable().optional(),
  taxOriginState: z.string().max(64).nullable().optional(),
  taxOriginPostalCode: z.string().max(32).nullable().optional(),
})

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  try {
    const store = await getStoreSettingsLite()
    if (!store) return err('Store not found', 404)

    const updated = await updateStoreSettings(store.id, {
      ...parsed.data,
      shippingThresholdCents:
        parsed.data.shippingThreshold === undefined ? undefined : dollarsToCents(parsed.data.shippingThreshold),
      shippingDomesticRateCents:
        parsed.data.shippingDomesticRate === undefined
          ? undefined
          : dollarsToCents(parsed.data.shippingDomesticRate),
      shippingInternationalRateCents:
        parsed.data.shippingInternationalRate === undefined
          ? undefined
          : dollarsToCents(parsed.data.shippingInternationalRate),
      ...(parsed.data.taxEnabled !== undefined ? { taxEnabled: parsed.data.taxEnabled } : {}),
      ...(parsed.data.taxStrategy !== undefined ? { taxStrategy: parsed.data.taxStrategy } : {}),
      ...(parsed.data.defaultTaxRatePercent !== undefined
        ? { defaultTaxRateBps: Math.round(parsed.data.defaultTaxRatePercent * 100) }
        : {}),
      ...(parsed.data.taxShipping !== undefined ? { taxShipping: parsed.data.taxShipping } : {}),
      ...(parsed.data.pricesIncludeTax !== undefined
        ? { pricesIncludeTax: parsed.data.pricesIncludeTax }
        : {}),
      ...(parsed.data.taxOriginCountry !== undefined
        ? { taxOriginCountry: parsed.data.taxOriginCountry || null }
        : {}),
      ...(parsed.data.taxOriginState !== undefined
        ? { taxOriginState: parsed.data.taxOriginState || null }
        : {}),
      ...(parsed.data.taxOriginPostalCode !== undefined
        ? { taxOriginPostalCode: parsed.data.taxOriginPostalCode || null }
        : {}),
      logoUrl: parsed.data.logoUrl || undefined,
    })

    return ok({
      ...updated,
      shippingThreshold: updated.shippingThresholdCents == null ? null : centsToDollars(updated.shippingThresholdCents),
      shippingDomesticRate: centsToDollars(updated.shippingDomesticRateCents),
      shippingInternationalRate: centsToDollars(updated.shippingInternationalRateCents),
      defaultTaxRatePercent: Number(updated.defaultTaxRateBps || 0) / 100,
    })
  } catch (e) {
    console.error('[PATCH /api/settings]', e)
    return err('Failed to update settings', 500)
  }
}

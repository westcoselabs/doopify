import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { getStoreSettingsLite } from '@/server/services/settings.service'

const schema = z.object({
  address1: z.string().trim().min(1),
  city: z.string().trim().min(1),
  stateProvince: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().min(2).max(3),
})

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Location validation payload is invalid', parsed.error.flatten())
  }

  try {
    const store = await getStoreSettingsLite()
    const provider = store?.shippingLiveProvider || null

    return ok({
      supported: false,
      provider,
      valid: null,
      normalizedAddress: null,
      message:
        provider
          ? 'Address pre-validation is not available yet. Save this address, then verify it by loading live checkout rates or purchasing a test label.'
          : 'Address pre-validation is not available yet. Save this address, then verify it by loading live checkout rates or purchasing a test label.',
    })
  } catch (error) {
    console.error('[POST /api/settings/shipping/locations/validate]', error)
    return err('Failed to validate ship-from location', 500)
  }
}

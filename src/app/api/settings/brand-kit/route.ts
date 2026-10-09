import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { brandKitUpdateSchema } from '@/lib/brand-kit'
import { requireAdmin } from '@/server/auth/require-auth'
import { getBrandKit, updateBrandKit } from '@/server/services/settings.service'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const brandKit = await getBrandKit()
    return ok(brandKit)
  } catch (error) {
    console.error('[GET /api/settings/brand-kit]', error)
    return err('Failed to fetch brand kit', 500)
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) {
    return err('Invalid request body')
  }

  try {
    const identity = brandKitUpdateSchema.pick({
      name: true, logoUrl: true, faviconUrl: true, emailLogoUrl: true, checkoutLogoUrl: true,
      emailFooterText: true, supportEmail: true, instagramUrl: true, facebookUrl: true,
      tiktokUrl: true, youtubeUrl: true,
    }).strict().parse(body)
    const updated = await updateBrandKit(identity)
    revalidatePath('/')
    revalidatePath('/shop')
    revalidatePath('/collections')
    revalidatePath('/checkout')
    revalidatePath('/api/storefront/settings')

    return ok(updated)
  } catch (error) {
    if (error instanceof ZodError) {
      return unprocessable('Brand kit payload is invalid', error.flatten())
    }

    console.error('[PATCH /api/settings/brand-kit]', error)
    return err('Failed to update brand kit', 500)
  }
}

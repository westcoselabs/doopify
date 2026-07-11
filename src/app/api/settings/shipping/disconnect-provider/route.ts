import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireOwner } from '@/server/auth/require-auth'
import { disconnectShippingProvider } from '@/server/shipping/shipping-provider.service'

export const runtime = 'nodejs'

const disconnectProviderSchema = z.object({
  provider: z.enum(['EASYPOST', 'SHIPPO']),
  clearCredentials: z.boolean().optional(),
})

export async function POST(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = disconnectProviderSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Shipping provider payload is invalid', parsed.error.flatten())
  }

  try {
    const status = await disconnectShippingProvider(parsed.data)
    return ok({
      provider: parsed.data.provider,
      status,
    })
  } catch (error) {
    console.error('[POST /api/settings/shipping/disconnect-provider]', error)
    const message = error instanceof Error ? error.message : 'Failed to disconnect provider'
    return err(message, 400)
  }
}

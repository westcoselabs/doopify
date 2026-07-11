import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireOwner } from '@/server/auth/require-auth'
import { connectShippingProvider } from '@/server/shipping/shipping-provider.service'

export const runtime = 'nodejs'

const connectProviderSchema = z.object({
  provider: z.enum(['EASYPOST', 'SHIPPO']),
  apiKey: z.string().min(1),
})

export async function POST(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = connectProviderSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Shipping provider payload is invalid', parsed.error.flatten())
  }

  try {
    const status = await connectShippingProvider(parsed.data)
    return ok({
      provider: parsed.data.provider,
      status,
    })
  } catch (error) {
    console.error('[POST /api/settings/shipping/connect-provider]', error)
    const message = error instanceof Error ? error.message : 'Failed to connect provider'
    return err(message, 400)
  }
}

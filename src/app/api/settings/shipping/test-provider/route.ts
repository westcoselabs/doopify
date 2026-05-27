import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { verifyProviderConnection } from '@/server/services/provider-connection.service'

export const runtime = 'nodejs'

const testProviderSchema = z.object({
  provider: z.enum(['EASYPOST', 'SHIPPO']),
})

function isExpectedVerificationFailure(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('not configured') ||
    message.includes('credentials are incomplete') ||
    message.includes('save credentials first')
  )
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = testProviderSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Shipping provider payload is invalid', parsed.error.flatten())
  }

  try {
    const verification = await verifyProviderConnection(parsed.data.provider)
    return ok({
      provider: parsed.data.provider,
      status: verification.status,
      result: {
        ok: verification.verification.ok,
        message: verification.verification.message,
        ...(verification.verification.metadata || {}),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test provider'
    if (isExpectedVerificationFailure(error)) {
      return ok({
        provider: parsed.data.provider,
        status: null,
        result: {
          ok: false,
          message,
        },
      })
    }

    console.error('[POST /api/settings/shipping/test-provider]', error)
    return err(message, 500)
  }
}

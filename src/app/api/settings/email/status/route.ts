import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { getEmailSettingsStatusSnapshot } from '@/server/email/email-settings-status.service'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const status = await getEmailSettingsStatusSnapshot()
    return ok(status)
  } catch (error) {
    console.error('[GET /api/settings/email/status]', error)
    return err('Failed to load email status', 500)
  }
}


import { ok } from '@/lib/api'
import { requireAuth } from '@/server/auth/require-auth'
import {
  buildFirstRunLaunchReadinessSnapshot,
  getLatestLaunchReadinessSnapshot,
} from '@/server/services/launch-readiness-snapshot.service'

export const runtime = 'nodejs'

function maskError(error: unknown) {
  if (!(error instanceof Error)) return 'Unknown error'
  const message = String(error.message || '')
  return message.replace(/(sk|pk|whsec|re)_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 200)
}

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const snapshot = await getLatestLaunchReadinessSnapshot()
    return ok(snapshot)
  } catch (error) {
    console.error('[GET /api/readiness]', maskError(error))
    return ok(buildFirstRunLaunchReadinessSnapshot())
  }
}

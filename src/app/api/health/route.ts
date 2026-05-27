import { ok, err } from '@/lib/api'
import { buildPublicStatusReport } from '@/server/services/public-status.service'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const report = await buildPublicStatusReport()
    return ok(report)
  } catch (error) {
    console.error('[GET /api/health]', error)
    return err('Failed to gather status', 500)
  }
}

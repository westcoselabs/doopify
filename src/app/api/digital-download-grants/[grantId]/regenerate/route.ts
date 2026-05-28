import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import {
  DigitalDeliveryAdminServiceError,
  regenerateDigitalDownloadGrant,
} from '@/server/services/digital-delivery-admin.service'

interface Params {
  params: Promise<{ grantId: string }>
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { grantId } = await params

  try {
    const result = await regenerateDigitalDownloadGrant(grantId)
    return ok(result)
  } catch (error) {
    if (error instanceof DigitalDeliveryAdminServiceError) {
      return err(error.message, error.status)
    }
    console.error('[POST /api/digital-download-grants/[grantId]/regenerate]', error)
    return err('Failed to regenerate digital download link', 500)
  }
}

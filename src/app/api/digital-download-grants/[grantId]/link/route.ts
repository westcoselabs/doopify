import { err, ok } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import {
  DigitalDeliveryAdminServiceError,
  getAdminDigitalDownloadLink,
} from '@/server/services/digital-delivery-admin.service'

interface Params {
  params: Promise<{ grantId: string }>
}

export async function GET(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { grantId } = await params

  try {
    const link = await getAdminDigitalDownloadLink(grantId)
    return ok(link)
  } catch (error) {
    if (error instanceof DigitalDeliveryAdminServiceError) {
      return err(error.message, error.status)
    }
    console.error('[GET /api/digital-download-grants/[grantId]/link]', error)
    return err('Failed to resolve digital download link', 500)
  }
}

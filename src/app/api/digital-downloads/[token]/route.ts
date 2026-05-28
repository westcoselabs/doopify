import { err } from '@/lib/api'
import { resolveDigitalDownloadByToken } from '@/server/services/digital-download-access.service'

type Params = {
  params: Promise<{ token: string }>
}

function sanitizeAttachmentFileName(fileName: string) {
  const safe = String(fileName || '')
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!safe) return 'download'
  return safe.slice(0, 180)
}

function toErrorResponse(result: Awaited<ReturnType<typeof resolveDigitalDownloadByToken>>) {
  if (result.ok) return null

  switch (result.result) {
    case 'INVALID_TOKEN':
      return err('Download link is invalid or unavailable.', 404)
    case 'DENIED_EXPIRED':
      return err('Download link has expired.', 410)
    case 'DENIED_REVOKED':
      return err('Download link is no longer available.', 410)
    case 'DENIED_EXHAUSTED':
      return err('Download limit reached for this file.', 410)
    default:
      return err('Download is unavailable.', 404)
  }
}

export async function GET(req: Request, { params }: Params) {
  const { token } = await params

  try {
    const result = await resolveDigitalDownloadByToken({
      token,
      ipAddress: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    })
    if (!result.ok) {
      return toErrorResponse(result) ?? err('Download is unavailable.', 404)
    }

    const safeFileName = sanitizeAttachmentFileName(result.file.fileName)
    const byteLength = result.file.bytes.length

    return new Response(new Uint8Array(result.file.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.file.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Content-Length': String(byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[GET /api/digital-downloads/[token]]', error)
    return err('Download is unavailable.', 500)
  }
}

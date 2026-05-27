type CspReportSummary = {
  effectiveDirective: string | null
  violatedDirective: string | null
  blockedUri: string | null
  disposition: string | null
}

export const runtime = 'nodejs'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function summarizeClassicCspReport(input: Record<string, unknown>): CspReportSummary | null {
  const report = asRecord(input['csp-report'])
  if (!report) return null

  return {
    effectiveDirective: toText(report['effective-directive']),
    violatedDirective: toText(report['violated-directive']),
    blockedUri: toText(report['blocked-uri']),
    disposition: toText(report.disposition),
  }
}

function summarizeReportToPayload(input: unknown): CspReportSummary | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const firstEnvelope = asRecord(input[0])
  const body = asRecord(firstEnvelope?.body)
  if (!body) return null

  return {
    effectiveDirective: toText(body.effectiveDirective),
    violatedDirective: toText(body.violatedDirective),
    blockedUri: toText(body.blockedURL),
    disposition: toText(body.disposition),
  }
}

async function getReportSummary(request: Request): Promise<CspReportSummary | null> {
  try {
    const payload = await request.json()
    return summarizeClassicCspReport(asRecord(payload) ?? {}) ?? summarizeReportToPayload(payload)
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const summary = await getReportSummary(request)
  if (summary) {
    console.warn('[POST /api/csp-report]', summary)
  }

  return new Response(null, { status: 204 })
}


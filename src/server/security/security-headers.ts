import type { NextResponse } from 'next/server'

type CspMode = 'off' | 'report-only' | 'enforce'

type RuntimeEnvironment = 'development' | 'production' | 'test'

export type SecurityHeaderOptions = {
  environment?: RuntimeEnvironment
  cspMode?: CspMode
  mediaOrigins?: string[]
  analyticsOrigins?: string[]
  cspReportUri?: string | null
  cspReportTo?: string | null
  cspReportToGroup?: string | null
}

const DEFAULT_MEDIA_ORIGINS = ['https:']
const STRIPE_SCRIPT_ORIGINS = ['https://js.stripe.com']
const STRIPE_CONNECT_ORIGINS = ['https://api.stripe.com', 'https://*.stripe.com']
const STRIPE_FRAME_ORIGINS = ['https://js.stripe.com', 'https://hooks.stripe.com']

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function parseOrigins(value: string | undefined) {
  if (!value) return []
  return value
    .split(',')
    .map((origin) => origin.trim())
    .map(toOriginSource)
    .filter(Boolean) as string[]
}

function toOriginSource(value: string | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed === 'https:' || trimmed === 'http:' || trimmed === 'data:' || trimmed === 'blob:') {
    return trimmed
  }

  if (trimmed.startsWith('*.')) {
    return `https://${trimmed}`
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.origin
  } catch {
    return trimmed
  }
}

function resolveMediaOrigins(explicitOrigins?: string[]) {
  if (explicitOrigins) {
    return unique(explicitOrigins.map(toOriginSource).filter(Boolean) as string[])
  }

  const configuredOrigins = [
    ...parseOrigins(process.env.CSP_MEDIA_ORIGINS),
    ...parseOrigins(process.env.MEDIA_PUBLIC_BASE_URL),
  ]

  if (configuredOrigins.length > 0) {
    return unique(configuredOrigins)
  }

  return DEFAULT_MEDIA_ORIGINS
}

function resolveEnvironment(value = process.env.NODE_ENV): RuntimeEnvironment {
  if (value === 'production' || value === 'test') return value
  return 'development'
}

function resolveCspMode(environment: RuntimeEnvironment, explicitMode?: CspMode): CspMode {
  if (explicitMode) return explicitMode

  const envMode = process.env.CSP_MODE as CspMode | undefined
  if (envMode === 'off' || envMode === 'report-only' || envMode === 'enforce') {
    return envMode
  }

  return 'report-only'
}

function resolveCspReportUri(explicitValue?: string | null) {
  const candidate = explicitValue ?? process.env.CSP_REPORT_URI ?? '/api/csp-report'
  if (typeof candidate !== 'string') return null

  const normalized = candidate.trim()
  if (!normalized) return null

  if (normalized.startsWith('/')) return normalized

  try {
    return new URL(normalized).toString()
  } catch {
    return null
  }
}

function resolveCspReportToEndpoint(explicitValue?: string | null) {
  const candidate = explicitValue ?? process.env.CSP_REPORT_TO
  if (typeof candidate !== 'string') return null

  const normalized = candidate.trim()
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

function resolveCspReportToGroup(explicitValue?: string | null) {
  const candidate = explicitValue ?? process.env.CSP_REPORT_TO_GROUP ?? 'csp-endpoint'
  if (typeof candidate !== 'string') return null

  const normalized = candidate.trim()
  if (!normalized) return null

  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) return null
  return normalized
}

function buildCsp(options: Required<Pick<SecurityHeaderOptions, 'mediaOrigins' | 'analyticsOrigins'>> & {
  environment: RuntimeEnvironment
  cspReportUri: string | null
  cspReportToGroup: string | null
}) {
  const scriptSources = unique([
    "'self'",
    "'unsafe-inline'",
    ...(options.environment === 'development' ? ["'unsafe-eval'"] : []),
    ...STRIPE_SCRIPT_ORIGINS,
  ])
  const styleSources = unique(["'self'", "'unsafe-inline'"])
  const imageSources = unique(["'self'", 'data:', 'blob:', ...options.mediaOrigins])
  const connectSources = unique([
    "'self'",
    ...STRIPE_CONNECT_ORIGINS,
    ...options.analyticsOrigins,
    ...(options.environment === 'development' ? ['ws:', 'wss:'] : []),
  ])
  const frameSources = unique(STRIPE_FRAME_ORIGINS)

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `script-src-elem ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
    `style-src-elem ${styleSources.join(' ')}`,
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    `frame-src ${frameSources.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(options.environment === 'production' ? ['upgrade-insecure-requests'] : []),
  ]

  if (options.cspReportUri) {
    directives.push(`report-uri ${options.cspReportUri}`)
  }

  if (options.cspReportToGroup) {
    directives.push(`report-to ${options.cspReportToGroup}`)
  }

  return directives.join('; ')
}

export function buildSecurityHeaders(options: SecurityHeaderOptions = {}) {
  const environment = resolveEnvironment(options.environment)
  const cspMode = resolveCspMode(environment, options.cspMode)
  const securityHeadersEnabled = process.env.SECURITY_HEADERS_ENABLED !== 'false'

  if (!securityHeadersEnabled) {
    return new Headers()
  }

  const headers = new Headers()
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)'
  )

  if (environment === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (cspMode !== 'off') {
    const cspReportUri = resolveCspReportUri(options.cspReportUri)
    const cspReportTo = resolveCspReportToEndpoint(options.cspReportTo)
    const cspReportToGroup = cspReportTo ? resolveCspReportToGroup(options.cspReportToGroup) : null

    const csp = buildCsp({
      environment,
      mediaOrigins: resolveMediaOrigins(options.mediaOrigins),
      analyticsOrigins: options.analyticsOrigins ?? parseOrigins(process.env.CSP_ANALYTICS_ORIGINS),
      cspReportUri,
      cspReportToGroup,
    })
    headers.set(
      cspMode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      csp
    )

    if (cspReportTo && cspReportToGroup) {
      headers.set(
        'Report-To',
        JSON.stringify({
          group: cspReportToGroup,
          max_age: 10886400,
          endpoints: [{ url: cspReportTo }],
        })
      )
      headers.set('Reporting-Endpoints', `${cspReportToGroup}="${cspReportTo}"`)
    }
  }

  return headers
}

export function applySecurityHeaders<TResponse extends NextResponse>(
  response: TResponse,
  options: SecurityHeaderOptions = {}
) {
  const headers = buildSecurityHeaders(options)
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

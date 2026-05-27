import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSecurityHeaders } from './security-headers'

describe('security headers', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...originalEnv }
  })

  it('sets baseline hardening headers', () => {
    const headers = buildSecurityHeaders({ environment: 'production', cspMode: 'off' })

    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
  })

  it('adds HSTS only in production', () => {
    expect(
      buildSecurityHeaders({ environment: 'production', cspMode: 'off' }).get('Strict-Transport-Security')
    ).toBe('max-age=31536000; includeSubDomains')

    expect(
      buildSecurityHeaders({ environment: 'development', cspMode: 'off' }).get('Strict-Transport-Security')
    ).toBeNull()
  })

  it('uses report-only CSP by default in production', () => {
    const headers = buildSecurityHeaders({ environment: 'production' })

    expect(headers.get('Content-Security-Policy')).toBeNull()
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'")
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("frame-ancestors 'none'")
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain('report-uri /api/csp-report')
  })

  it('uses report-only CSP by default in non-production environments too', () => {
    const headers = buildSecurityHeaders({ environment: 'development' })
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'")
  })

  it('can enforce CSP when explicitly configured', () => {
    const headers = buildSecurityHeaders({ environment: 'production', cspMode: 'enforce' })

    expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(headers.get('Content-Security-Policy-Report-Only')).toBeNull()
  })

  it('can disable CSP explicitly', () => {
    const headers = buildSecurityHeaders({ environment: 'production', cspMode: 'off' })

    expect(headers.get('Content-Security-Policy')).toBeNull()
    expect(headers.get('Content-Security-Policy-Report-Only')).toBeNull()
  })

  it('includes Stripe origins required by checkout', () => {
    const csp = buildSecurityHeaders({ environment: 'production' }).get('Content-Security-Policy-Report-Only')

    expect(csp).toContain('https://js.stripe.com')
    expect(csp).toContain('https://api.stripe.com')
    expect(csp).toContain('https://*.stripe.com')
    expect(csp).toContain('https://hooks.stripe.com')
  })

  it('supports explicit media and analytics origins', () => {
    const csp = buildSecurityHeaders({
      environment: 'production',
      mediaOrigins: ['https://media.example.com'],
      analyticsOrigins: ['https://analytics.example.com'],
    }).get('Content-Security-Policy-Report-Only')

    expect(csp).toContain('https://media.example.com')
    expect(csp).toContain('https://analytics.example.com')
  })

  it('uses broad https media fallback when no exact media origin is configured', () => {
    const csp = buildSecurityHeaders({ environment: 'production' }).get('Content-Security-Policy-Report-Only')

    expect(csp).toContain("img-src 'self' data: blob: https:")
  })

  it('includes MEDIA_PUBLIC_BASE_URL as an exact media origin', () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE_URL', 'https://cdn.example.com/media')

    const csp = buildSecurityHeaders({ environment: 'production' }).get('Content-Security-Policy-Report-Only')

    expect(csp).toContain("img-src 'self' data: blob: https://cdn.example.com")
    expect(csp).not.toMatch(/img-src[^;]*\shttps:(?:\s|;|$)/)
  })

  it('uses CSP_MEDIA_ORIGINS as exact media origins without broad https fallback', () => {
    vi.stubEnv('CSP_MEDIA_ORIGINS', 'https://media.example.com, assets.example.com')

    const csp = buildSecurityHeaders({ environment: 'production' }).get('Content-Security-Policy-Report-Only')

    expect(csp).toContain('https://media.example.com')
    expect(csp).toContain('https://assets.example.com')
    expect(csp).not.toMatch(/img-src[^;]*\shttps:(?:\s|;|$)/)
  })

  it('can disable all security headers for emergency rollback', () => {
    vi.stubEnv('SECURITY_HEADERS_ENABLED', 'false')

    const headers = buildSecurityHeaders({ environment: 'production' })

    expect(Array.from(headers.entries())).toEqual([])
  })

  it('adds report-to headers and CSP directive when configured', () => {
    const headers = buildSecurityHeaders({
      environment: 'production',
      cspReportTo: 'https://reports.example.com/csp',
      cspReportToGroup: 'doopify-csp',
    })

    expect(headers.get('Content-Security-Policy-Report-Only')).toContain('report-to doopify-csp')
    expect(headers.get('Report-To')).toContain('"group":"doopify-csp"')
    expect(headers.get('Report-To')).toContain('https://reports.example.com/csp')
    expect(headers.get('Reporting-Endpoints')).toBe('doopify-csp="https://reports.example.com/csp"')
  })

  it('ignores invalid report-to endpoint values', () => {
    const headers = buildSecurityHeaders({
      environment: 'production',
      cspReportTo: 'not-a-valid-url',
      cspReportToGroup: 'doopify-csp',
    })

    expect(headers.get('Content-Security-Policy-Report-Only')).not.toContain('report-to doopify-csp')
    expect(headers.get('Report-To')).toBeNull()
    expect(headers.get('Reporting-Endpoints')).toBeNull()
  })
})

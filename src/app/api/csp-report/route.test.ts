import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

describe('POST /api/csp-report', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts classic CSP report payloads and returns 204 without local noise by default', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const request = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://bad.example.com/script.js',
          disposition: 'report',
        },
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(204)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('logs reports when explicit CSP report logging is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('CSP_REPORT_LOG', '1')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const request = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'effective-directive': 'script-src-elem',
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://bad.example.com/script.js',
          disposition: 'report',
        },
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(204)
    expect(warnSpy).toHaveBeenCalledWith(
      '[POST /api/csp-report]',
      expect.objectContaining({
        effectiveDirective: 'script-src-elem',
        violatedDirective: 'script-src-elem',
      })
    )
  })

  it('returns 204 for invalid JSON payloads', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const request = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: 'not-json',
    })

    const response = await POST(request)

    expect(response.status).toBe(204)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})


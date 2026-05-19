import { afterEach, describe, expect, it, vi } from 'vitest'

import { isRouteTimingEnabled, withRouteTiming } from './timing'

const originalEnv = { ...process.env }

describe('route timing helper', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('is disabled by default', () => {
    delete process.env.DOOPIFY_ROUTE_TIMING
    process.env.NODE_ENV = 'development'
    expect(isRouteTimingEnabled()).toBe(false)
  })

  it('stays disabled in production-like environments even when enabled', () => {
    process.env.DOOPIFY_ROUTE_TIMING = '1'
    process.env.NODE_ENV = 'production'
    process.env.VERCEL_ENV = 'production'
    expect(isRouteTimingEnabled()).toBe(false)
  })

  it('logs route timing when enabled outside production', async () => {
    process.env.DOOPIFY_ROUTE_TIMING = '1'
    process.env.NODE_ENV = 'test'
    process.env.VERCEL_ENV = 'preview'
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const request = new Request('https://example.com/api/orders', {
      headers: {
        'x-request-id': 'req_123',
      },
    })

    const response = await withRouteTiming('GET /api/orders', request, async ({ step }) => {
      step('auth')
      step('query')
      return new Response('ok', { status: 200 })
    })

    expect(response.status).toBe(200)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const [prefix, payload] = logSpy.mock.calls[0] as [string, string]
    expect(prefix).toBe('[route-timing]')
    expect(payload).toContain('"route":"GET /api/orders"')
    expect(payload).toContain('"requestId":"req_123"')
  })
})

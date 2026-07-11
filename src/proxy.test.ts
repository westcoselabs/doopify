import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifyToken: mocks.verifyToken,
}))

import { proxy } from './proxy'

describe('proxy auth protection and security headers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps storefront API routes public and adds security headers', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/storefront/collections'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain("frame-ancestors 'none'")
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('adds security headers to public storefront pages', async () => {
    const response = await proxy(new NextRequest('http://localhost/shop'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('blocks private admin API routes when no auth cookie exists and adds security headers', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/collections'))

    expect(response.status).toBe(401)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.json()).toEqual({
      success: false,
      error: 'Unauthorized',
    })
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('adds security headers to admin login redirects', async () => {
    const response = await proxy(new NextRequest('http://localhost/admin'))

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(response.headers.get('location')).toContain('/login?next=%2Fadmin')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('returns 401 when a private admin API token is invalid and adds security headers', async () => {
    mocks.verifyToken.mockResolvedValue(null)

    const response = await proxy(
      new NextRequest('http://localhost/api/collections', {
        headers: {
          cookie: 'doopify_token=bad_token',
        },
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid or expired session',
    })
    expect(mocks.verifyToken).toHaveBeenCalledWith('bad_token')
  })

  it('allows private admin API routes when auth is valid, injects identity headers, and adds security headers', async () => {
    mocks.verifyToken.mockResolvedValue({
      userId: 'user_1',
      email: 'admin@example.com',
      role: 'OWNER',
      sessionId: 'session_1',
    })

    const response = await proxy(
      new NextRequest('http://localhost/api/collections', {
        headers: {
          cookie: 'doopify_token=good_token',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-user-id')).toBe('user_1')
    expect(response.headers.get('x-user-role')).toBe('OWNER')
    expect(response.headers.get('x-user-email')).toBe('admin@example.com')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('keeps webhook routes public while adding security headers', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/webhooks/stripe'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('uses a no-referrer policy for checkout pages', async () => {
    const response = await proxy(new NextRequest('http://localhost/checkout/success'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('keeps GET /api/media/:assetId public for storefront image delivery', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/media/asset_1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('still blocks unauthenticated media mutation requests', async () => {
    const patchResponse = await proxy(
      new NextRequest('http://localhost/api/media/asset_1', {
        method: 'PATCH',
      })
    )
    const deleteResponse = await proxy(
      new NextRequest('http://localhost/api/media/asset_1', {
        method: 'DELETE',
      })
    )

    expect(patchResponse.status).toBe(401)
    expect(await patchResponse.json()).toEqual({
      success: false,
      error: 'Unauthorized',
    })
    expect(deleteResponse.status).toBe(401)
    expect(await deleteResponse.json()).toEqual({
      success: false,
      error: 'Unauthorized',
    })
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /create-owner through without auth as a public route', async () => {
    const response = await proxy(new NextRequest('http://localhost/create-owner'))

    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /api/bootstrap/owner through without auth as a public route', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/bootstrap/owner'))

    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /join through without auth as a public route', async () => {
    const response = await proxy(new NextRequest('http://localhost/join'))

    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /api/team/invites/accept through without auth as a public route', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/team/invites/accept'))

    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('blocks /api/team/users without auth', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/team/users'))

    expect(response.status).toBe(401)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /reset-password through without auth as a public route', async () => {
    const response = await proxy(new NextRequest('http://localhost/reset-password'))
    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })

  it('allows /api/auth/password-reset through without auth (public token-gated endpoint)', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/auth/password-reset'))
    expect(response.status).toBe(200)
    expect(mocks.verifyToken).not.toHaveBeenCalled()
  })
})

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { verifyToken } from '@/lib/auth'
import { applySecurityHeaders } from '@/server/security/security-headers'

const PUBLIC_PREFIXES = [
  '/login',
  '/create-owner',
  '/join',
  '/reset-password',
  '/api/auth',
  '/api/bootstrap',
  '/api/team/invites/accept',
  '/api/checkout',
  '/api/storefront',
  '/api/webhooks',
  '/api/health',
  '/api/csp-report',
  '/api/webhook-retries',
  '/api/abandoned-checkouts/send-due',
  '/api/jobs/run',
  '/_next',
  '/favicon',
  '/images',
  '/public',
]

function isPublicMediaReadRequest(pathname: string, method: string) {
  // Storefront product DTOs expose media as /api/media/:assetId.
  // Keep reads public for asset delivery while mutations stay authenticated.
  return method === 'GET' && /^\/api\/media\/[^/]+$/.test(pathname)
}

function nextWithSecurityHeaders() {
  return applySecurityHeaders(NextResponse.next())
}

function jsonWithSecurityHeaders(body: unknown, init: ResponseInit) {
  return applySecurityHeaders(NextResponse.json(body, init))
}

function redirectWithSecurityHeaders(url: URL) {
  return applySecurityHeaders(NextResponse.redirect(url))
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicMediaReadRequest(pathname, req.method)) {
    return nextWithSecurityHeaders()
  }

  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (isPublic) return nextWithSecurityHeaders()

  if (!pathname.startsWith('/api/') && !isAdminPage(pathname)) {
    return nextWithSecurityHeaders()
  }

  const token = req.cookies.get('doopify_token')?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return jsonWithSecurityHeaders(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return redirectWithSecurityHeaders(createLoginUrl(req))
  }

  const payload = await verifyToken(token)
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return jsonWithSecurityHeaders(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      )
    }

    const res = redirectWithSecurityHeaders(createLoginUrl(req))
    res.cookies.delete('doopify_token')
    return res
  }

  const res = nextWithSecurityHeaders()
  res.headers.set('x-user-id', payload.userId)
  res.headers.set('x-user-role', payload.role)
  res.headers.set('x-user-email', payload.email)
  return res
}

function isAdminPage(pathname: string) {
  const adminPaths = [
    '/admin',
    '/orders',
    '/products',
    '/customers',
    '/discounts',
    '/analytics',
    '/settings',
    '/draft-orders',
    '/media',
  ]

  return adminPaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function createLoginUrl(req: NextRequest) {
  const loginUrl = new URL('/login', req.url)
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`

  if (nextPath && nextPath !== '/login') {
    loginUrl.searchParams.set('next', nextPath)
  }

  return loginUrl
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

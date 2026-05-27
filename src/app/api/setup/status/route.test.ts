import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  queryRaw: vi.fn(),
  storeCount: vi.fn(),
  userCount: vi.fn(),
  findStore: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: mocks.queryRaw,
    store: {
      count: mocks.storeCount,
      findFirst: mocks.findStore,
    },
    user: {
      count: mocks.userCount,
    },
  },
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: mocks.existsSync,
  },
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

import { GET } from './route'

describe('GET /api/setup/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }])
    mocks.storeCount.mockResolvedValue(1)
    mocks.userCount.mockResolvedValue(1)
    mocks.findStore.mockResolvedValue({
      id: 'store_1',
      name: 'Doopify Store',
      email: 'owner@example.com',
    })
    mocks.existsSync.mockReturnValue(true)

    process.env.DATABASE_URL = 'postgresql://db_user:super-secret-password@localhost:5432/doopify'
    process.env.JWT_SECRET = 'super-strong-jwt-secret-that-should-never-leak'
    process.env.STRIPE_SECRET_KEY = 'sk_test_secret_should_not_leak'
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_public'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_secret_should_not_leak'
    process.env.WEBHOOK_RETRY_SECRET = 'retry-secret-should-not-leak'
    process.env.RESEND_API_KEY = 're_api_secret_should_not_leak'
    process.env.RESEND_WEBHOOK_SECRET = 're_whsec_secret_should_not_leak'
    process.env.NEXT_PUBLIC_STORE_URL = 'https://shop.example.com'
    process.env.VERCEL_URL = 'example.vercel.app'
  })

  it('returns JSON auth errors for unauthenticated users', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(payload).toEqual({ success: false, error: 'Unauthorized' })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('returns JSON auth errors for STAFF users (owner-only route)', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(payload).toEqual({ success: false, error: 'Forbidden' })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('allows OWNER users to access setup diagnostics', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_2', email: 'owner2@example.com', role: 'OWNER' },
    })

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(expect.objectContaining({ checks: expect.any(Array) }))
  })

  it('returns safe setup diagnostics with no raw secrets', async () => {
    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        checks: expect.any(Array),
        passCount: expect.any(Number),
        warnCount: expect.any(Number),
        failCount: expect.any(Number),
        requiredFailCount: expect.any(Number),
        ok: expect.any(Boolean),
        overallStatus: expect.any(String),
        completionPercent: expect.any(Number),
        requiredChecks: expect.any(Array),
        recommendedChecks: expect.any(Array),
        warnings: expect.any(Array),
        safeNextActions: expect.any(Array),
        nextActions: expect.any(Array),
        categories: expect.any(Array),
        requiredNextSteps: expect.any(Array),
        providerSetupSteps: expect.any(Array),
        optionalProductionSteps: expect.any(Array),
      })
    )

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('super-strong-jwt-secret-that-should-never-leak')
    expect(serialized).not.toContain('sk_test_secret_should_not_leak')
    expect(serialized).not.toContain('whsec_secret_should_not_leak')
    expect(serialized).not.toContain('retry-secret-should-not-leak')
    expect(serialized).not.toContain('re_api_secret_should_not_leak')
    expect(serialized).not.toContain('re_whsec_secret_should_not_leak')
    expect(serialized).not.toContain('super-secret-password')
  })

  it('returns success with failing checks when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.requiredChecks).toEqual(expect.any(Array))
    expect(payload.data.recommendedChecks).toEqual(expect.any(Array))

    const databaseUrlCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'database-url')
    const databaseReachableCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'database-reachable')
    expect(databaseUrlCheck?.status).toBe('FAIL')
    expect(databaseReachableCheck?.status).toBe('WARN')
  })

  it('does not claim provider verification when Stripe keys only exist in env', async () => {
    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    const stripeKeysCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'stripe-keys')
    expect(stripeKeysCheck?.status).toBe('PASS')
    expect(stripeKeysCheck?.summary).toContain('Provider API verification has not been run from this screen')
  })

  it('includes bootstrap as a required next step when store is missing', async () => {
    mocks.storeCount.mockResolvedValueOnce(0)
    mocks.findStore.mockResolvedValueOnce(null)

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.requiredNextSteps).toContain(
      'Run npm run db:seed:bootstrap to create the initial store and owner records.'
    )
  })

  it('includes webhook retry secret guidance as a required next step when missing', async () => {
    delete process.env.WEBHOOK_RETRY_SECRET

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.requiredNextSteps.some((step: string) => step.includes('WEBHOOK_RETRY_SECRET'))).toBe(true)
  })

  it('flags missing resend webhook secret when resend api key is present', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)

    const resendApiCheck = payload.data.recommendedChecks.find((check: { id: string }) => check.id === 'resend-api-or-preview')
    const resendWebhookCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'resend-webhook-secret-enabled')

    expect(resendApiCheck?.status).toBe('PASS')
    expect(resendWebhookCheck?.status).toBe('FAIL')
    expect(resendWebhookCheck?.summary).toContain(
      'Live email sending may work, but bounce/complaint webhook verification is not configured.'
    )
  })

  it('treats placeholder Stripe and Resend env values as missing', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_replace_me'
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_replace_me'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_replace_me'
    process.env.RESEND_API_KEY = 're_replace_me'
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_replace_me'

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)

    const stripeKeysCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'stripe-keys')
    const stripeWebhookCheck = payload.data.requiredChecks.find(
      (check: { id: string }) => check.id === 'stripe-webhook-secret'
    )
    const resendApiCheck = payload.data.recommendedChecks.find(
      (check: { id: string }) => check.id === 'resend-api-or-preview'
    )

    expect(stripeKeysCheck?.status).toBe('FAIL')
    expect(stripeWebhookCheck?.status).toBe('FAIL')
    expect(resendApiCheck?.status).toBe('WARN')
  })

  it('fails NEXT_PUBLIC_STORE_URL check when placeholder deployment domain is configured', async () => {
    process.env.NEXT_PUBLIC_STORE_URL = 'https://your-doopify-beta-domain.vercel.app'

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)

    const publicUrlCheck = payload.data.requiredChecks.find(
      (check: { id: string }) => check.id === 'next-public-store-url'
    )
    expect(publicUrlCheck?.status).toBe('FAIL')
    expect(publicUrlCheck?.summary).toContain('placeholder domain')
  })

  it('sanitizes database connectivity failures and still returns useful diagnostics', async () => {
    mocks.queryRaw.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED postgresql://db_user:raw-password@localhost:5432/doopify')
    )

    const response = await GET(new Request('http://localhost/api/setup/status'))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)

    const databaseReachableCheck = payload.data.requiredChecks.find((check: { id: string }) => check.id === 'database-reachable')
    expect(databaseReachableCheck?.status).toBe('FAIL')
    expect(databaseReachableCheck?.fix).toContain('Verify database server accessibility and credentials')

    expect(serialized).toContain('db_user:***@')
    expect(serialized).not.toContain('raw-password')
  })
})

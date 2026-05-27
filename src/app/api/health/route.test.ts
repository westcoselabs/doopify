import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildPublicStatusReport: vi.fn(),
}))

vi.mock('@/server/services/public-status.service', () => ({
  buildPublicStatusReport: mocks.buildPublicStatusReport,
}))

import { GET } from './route'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.buildPublicStatusReport.mockResolvedValue({
      app: 'ok',
      database: 'reachable',
      requiredEnv: {
        present: ['DATABASE_URL', 'JWT_SECRET'],
        missing: [],
      },
      stripe: 'configured',
      email: 'configured',
      mediaStorage: {
        provider: 'postgres',
      },
      checkedAt: '2026-05-22T00:00:00.000Z',
    })
  })

  it('returns a safe status envelope', async () => {
    process.env.DATABASE_URL = 'postgresql://db_user:super-secret-password@localhost:5432/doopify'
    process.env.JWT_SECRET = 'jwt-secret-that-should-not-leak'
    process.env.STRIPE_SECRET_KEY = 'sk_test_secret_should_not_leak'

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        app: 'ok',
        database: expect.stringMatching(/reachable|unreachable/),
        requiredEnv: expect.objectContaining({
          present: expect.any(Array),
          missing: expect.any(Array),
        }),
        stripe: expect.stringMatching(/configured|not_configured|unknown/),
        email: expect.stringMatching(/configured|optional|not_configured/),
        mediaStorage: expect.objectContaining({
          provider: expect.stringMatching(/postgres|s3|vercel-blob|unknown/),
        }),
        checkedAt: expect.any(String),
      })
    )

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('super-secret-password')
    expect(serialized).not.toContain('jwt-secret-that-should-not-leak')
    expect(serialized).not.toContain('sk_test_secret_should_not_leak')
  })

  it('returns a 500 error when status gathering fails', async () => {
    mocks.buildPublicStatusReport.mockRejectedValueOnce(new Error('status failure'))

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      success: false,
      error: 'Failed to gather status',
    })
  })
})

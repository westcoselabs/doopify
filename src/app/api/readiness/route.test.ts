import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getLatestLaunchReadinessSnapshot: vi.fn(),
  buildFirstRunLaunchReadinessSnapshot: vi.fn(() => ({
    snapshotState: 'first_run',
    firstRun: true,
    firstRunMessage: 'No launch check has been run yet.',
    lastRunAt: null,
    snapshotSavedAt: null,
    checkedAt: '',
    checks: [],
    summary: {
      launchReady: false,
      total: 0,
      ready: 0,
      blockers: 0,
      warnings: 0,
      optional: 0,
      checkedAt: '',
    },
    readyCount: 0,
    needsSetupCount: 0,
    optionalCount: 0,
    skippedCount: 0,
    warningCount: 0,
    blockerCount: 0,
    launchReady: false,
  })),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('@/server/services/launch-readiness-snapshot.service', () => ({
  getLatestLaunchReadinessSnapshot: mocks.getLatestLaunchReadinessSnapshot,
  buildFirstRunLaunchReadinessSnapshot: mocks.buildFirstRunLaunchReadinessSnapshot,
}))

import { GET } from './route'

describe('GET /api/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns auth response unchanged when session is missing', async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/readiness'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ success: false, error: 'Unauthorized' })
    expect(mocks.getLatestLaunchReadinessSnapshot).not.toHaveBeenCalled()
  })

  it('returns first-run state when no saved snapshot exists', async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      user: { id: 'staff_1', role: 'STAFF', email: 'staff@example.com' },
    })
    mocks.getLatestLaunchReadinessSnapshot.mockResolvedValue({
      snapshotState: 'first_run',
      firstRun: true,
      firstRunMessage: 'No launch check has been run yet.',
      lastRunAt: null,
      snapshotSavedAt: null,
      checkedAt: '',
      checks: [],
      summary: {
        launchReady: false,
        total: 0,
        ready: 0,
        blockers: 0,
        warnings: 0,
        optional: 0,
        checkedAt: '',
      },
      readyCount: 0,
      needsSetupCount: 0,
      optionalCount: 0,
      skippedCount: 0,
      warningCount: 0,
      blockerCount: 0,
      launchReady: false,
    })

    const response = await GET(new Request('http://localhost/api/readiness'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        snapshotState: 'first_run',
        firstRun: true,
        firstRunMessage: 'No launch check has been run yet.',
        checks: [],
      })
    )
  })

  it('returns saved snapshot payload when available', async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    mocks.getLatestLaunchReadinessSnapshot.mockResolvedValue({
      snapshotState: 'saved',
      firstRun: false,
      firstRunMessage: null,
      lastRunAt: '2026-05-21T00:00:00.000Z',
      snapshotSavedAt: '2026-05-21T00:01:00.000Z',
      checkedAt: '2026-05-21T00:00:00.000Z',
      checks: [{ id: 'shipping', title: 'Shipping rates', status: 'warning' }],
      summary: {
        launchReady: true,
        total: 1,
        ready: 0,
        blockers: 0,
        warnings: 1,
        optional: 1,
        checkedAt: '2026-05-21T00:00:00.000Z',
      },
      readyCount: 0,
      needsSetupCount: 0,
      optionalCount: 1,
      skippedCount: 0,
      warningCount: 1,
      blockerCount: 0,
      launchReady: true,
    })

    const response = await GET(new Request('http://localhost/api/readiness'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        snapshotState: 'saved',
        firstRun: false,
        lastRunAt: '2026-05-21T00:00:00.000Z',
        checks: expect.any(Array),
      })
    )
  })

  it('falls back to first-run payload when snapshot read throws', async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    mocks.getLatestLaunchReadinessSnapshot.mockRejectedValue(new Error('database unavailable'))

    const response = await GET(new Request('http://localhost/api/readiness'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        snapshotState: 'first_run',
        firstRun: true,
      })
    )
  })
})

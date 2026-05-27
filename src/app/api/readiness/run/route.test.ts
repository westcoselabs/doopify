import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  runLaunchReadinessCheck: vi.fn(),
  saveLaunchReadinessSnapshot: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/server/services/launch-readiness-runner.service', () => ({
  runLaunchReadinessCheck: mocks.runLaunchReadinessCheck,
}))

vi.mock('@/server/services/launch-readiness-snapshot.service', () => ({
  saveLaunchReadinessSnapshot: mocks.saveLaunchReadinessSnapshot,
  isLaunchReadinessSnapshotTableMissingError: (error: unknown) =>
    error instanceof Error && /launch_readiness_snapshots/i.test(error.message),
}))

import { POST } from './route'

describe('POST /api/readiness/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks non-owner users from rerunning readiness', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await POST(new Request('http://localhost/api/readiness/run', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ success: false, error: 'Forbidden' })
    expect(mocks.runLaunchReadinessCheck).not.toHaveBeenCalled()
  })

  it('runs and saves readiness snapshot for owner', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    const runResult = {
      checkedAt: '2026-05-21T00:00:00.000Z',
      checks: [{ id: 'shipping', status: 'warning' }],
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
    }
    mocks.runLaunchReadinessCheck.mockResolvedValue(runResult)
    mocks.saveLaunchReadinessSnapshot.mockResolvedValue({
      ...runResult,
      snapshotState: 'saved',
      firstRun: false,
      firstRunMessage: null,
      lastRunAt: '2026-05-21T00:00:00.000Z',
      snapshotSavedAt: '2026-05-21T00:01:00.000Z',
    })

    const response = await POST(new Request('http://localhost/api/readiness/run', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.runLaunchReadinessCheck).toHaveBeenCalledTimes(1)
    expect(mocks.saveLaunchReadinessSnapshot).toHaveBeenCalledWith({
      payload: runResult,
      runByUserId: 'owner_1',
    })
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual(
      expect.objectContaining({
        snapshotState: 'saved',
        firstRun: false,
      })
    )
  })

  it('returns a safe failure message when launch check run fails', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    mocks.runLaunchReadinessCheck.mockRejectedValue(new Error('relation "launch_readiness_snapshots" does not exist'))

    const response = await POST(new Request('http://localhost/api/readiness/run', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      success: false,
      error: 'Launch check could not complete. Try again after confirming migrations and diagnostics.',
    })
    expect(mocks.saveLaunchReadinessSnapshot).not.toHaveBeenCalled()
  })

  it('returns a safe snapshot-save message when run succeeds but snapshot save fails', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    mocks.runLaunchReadinessCheck.mockResolvedValue({
      checkedAt: '2026-05-21T00:00:00.000Z',
      checks: [],
      summary: {
        launchReady: false,
        total: 0,
        ready: 0,
        blockers: 0,
        warnings: 0,
        optional: 0,
        checkedAt: '2026-05-21T00:00:00.000Z',
      },
      readyCount: 0,
      needsSetupCount: 0,
      optionalCount: 0,
      skippedCount: 0,
      warningCount: 0,
      blockerCount: 0,
      launchReady: false,
    })
    mocks.saveLaunchReadinessSnapshot.mockRejectedValue(new Error('upsert failed'))

    const response = await POST(new Request('http://localhost/api/readiness/run', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      success: false,
      error: 'Launch check ran, but the snapshot could not be saved. Try running it again.',
    })
  })

  it('returns migration guidance when snapshot table is missing', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', role: 'OWNER', email: 'owner@example.com' },
    })
    mocks.runLaunchReadinessCheck.mockResolvedValue({
      checkedAt: '2026-05-21T00:00:00.000Z',
      checks: [],
      summary: {
        launchReady: false,
        total: 0,
        ready: 0,
        blockers: 0,
        warnings: 0,
        optional: 0,
        checkedAt: '2026-05-21T00:00:00.000Z',
      },
      readyCount: 0,
      needsSetupCount: 0,
      optionalCount: 0,
      skippedCount: 0,
      warningCount: 0,
      blockerCount: 0,
      launchReady: false,
    })
    mocks.saveLaunchReadinessSnapshot.mockRejectedValue(
      new Error('relation "launch_readiness_snapshots" does not exist')
    )

    const response = await POST(new Request('http://localhost/api/readiness/run', { method: 'POST' }))
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toEqual({
      success: false,
      error: 'Launch check ran, but the snapshot could not be saved. Apply database migrations and try again.',
    })
  })
})

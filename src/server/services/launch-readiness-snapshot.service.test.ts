import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    launchReadinessSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))

import {
  buildFirstRunLaunchReadinessSnapshot,
  getLatestLaunchReadinessSnapshot,
} from './launch-readiness-snapshot.service'

describe('getLatestLaunchReadinessSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns first-run payload when no snapshot exists', async () => {
    mocks.prisma.launchReadinessSnapshot.findUnique.mockResolvedValue(null)

    const result = await getLatestLaunchReadinessSnapshot()

    expect(result).toEqual(buildFirstRunLaunchReadinessSnapshot())
  })

  it('returns first-run payload when saved snapshot payload is invalid', async () => {
    mocks.prisma.launchReadinessSnapshot.findUnique.mockResolvedValue({
      payload: { invalid: true },
      checkedAt: new Date('2026-05-21T00:00:00.000Z'),
      updatedAt: new Date('2026-05-21T00:00:00.000Z'),
    })

    const result = await getLatestLaunchReadinessSnapshot()

    expect(result).toEqual(buildFirstRunLaunchReadinessSnapshot())
  })

  it('returns saved payload when a valid snapshot exists', async () => {
    mocks.prisma.launchReadinessSnapshot.findUnique.mockResolvedValue({
      payload: {
        checkedAt: '2026-05-21T00:00:00.000Z',
        checks: [{ id: 'shipping', status: 'warning' }],
        summary: {
          launchReady: false,
          total: 1,
          ready: 0,
          blockers: 0,
          warnings: 1,
          optional: 0,
          checkedAt: '2026-05-21T00:00:00.000Z',
        },
        readyCount: 0,
        needsSetupCount: 1,
        optionalCount: 0,
        skippedCount: 0,
        warningCount: 1,
        blockerCount: 0,
        launchReady: false,
      },
      checkedAt: new Date('2026-05-21T00:00:00.000Z'),
      updatedAt: new Date('2026-05-21T00:01:00.000Z'),
    })

    const result = await getLatestLaunchReadinessSnapshot()

    expect(result).toEqual(
      expect.objectContaining({
        snapshotState: 'saved',
        firstRun: false,
        firstRunMessage: null,
        lastRunAt: '2026-05-21T00:00:00.000Z',
        snapshotSavedAt: '2026-05-21T00:01:00.000Z',
        checks: expect.any(Array),
      })
    )
  })

  it('returns first-run payload when snapshot table is unavailable in local/dev', async () => {
    mocks.prisma.launchReadinessSnapshot.findUnique.mockRejectedValue(
      new Error('relation "launch_readiness_snapshots" does not exist')
    )

    const result = await getLatestLaunchReadinessSnapshot()

    expect(result).toEqual(buildFirstRunLaunchReadinessSnapshot())
  })

  it('rethrows unexpected persistence errors', async () => {
    mocks.prisma.launchReadinessSnapshot.findUnique.mockRejectedValue(new Error('database disconnected'))

    await expect(getLatestLaunchReadinessSnapshot()).rejects.toThrow('database disconnected')
  })
})

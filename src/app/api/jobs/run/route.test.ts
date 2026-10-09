import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runDueJobs: vi.fn(),
  recordJobRunnerStart: vi.fn(),
  recordJobRunnerSuccess: vi.fn(),
  recordJobRunnerFailure: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: {
    JOB_RUNNER_SECRET: 'job-runner-secret-value',
    WEBHOOK_RETRY_SECRET: 'webhook-retry-secret-value',
  },
}))

vi.mock('@/server/jobs/job.service', () => ({
  runDueJobs: mocks.runDueJobs,
}))
vi.mock('@/server/jobs/job-runner-heartbeat.service', () => ({
  recordJobRunnerStart: mocks.recordJobRunnerStart,
  recordJobRunnerSuccess: mocks.recordJobRunnerSuccess,
  recordJobRunnerFailure: mocks.recordJobRunnerFailure,
}))

import { POST } from './route'

describe('POST /api/jobs/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runDueJobs.mockResolvedValue({
      processed: 3,
      succeeded: 2,
      failed: 1,
      skipped: 0,
      results: [],
    })
    mocks.recordJobRunnerStart.mockResolvedValue({})
    mocks.recordJobRunnerSuccess.mockResolvedValue({})
    mocks.recordJobRunnerFailure.mockResolvedValue({})
  })

  it('requires a runner secret', async () => {
    const response = await POST(new Request('http://localhost/api/jobs/run', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(mocks.runDueJobs).not.toHaveBeenCalled()
    expect(mocks.recordJobRunnerStart).not.toHaveBeenCalled()
  })

  it('runs due jobs when authorized', async () => {
    const response = await POST(
      new Request('http://localhost/api/jobs/run?limit=15&workerId=cron-worker', {
        method: 'POST',
        headers: {
          authorization: 'Bearer job-runner-secret-value',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.runDueJobs).toHaveBeenCalledWith({
      limit: 15,
      workerId: 'cron-worker',
    })
    expect(mocks.recordJobRunnerStart).toHaveBeenCalledWith('cron-worker', expect.any(Date))
    expect(mocks.recordJobRunnerSuccess).toHaveBeenCalledWith(
      'cron-worker',
      expect.objectContaining({
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      })
    )
  })

  it('does not block job execution when heartbeat writes fail', async () => {
    mocks.recordJobRunnerStart.mockRejectedValue(new Error('heartbeat down'))

    const response = await POST(
      new Request('http://localhost/api/jobs/run?workerId=external-worker', {
        method: 'POST',
        headers: {
          authorization: 'Bearer job-runner-secret-value',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.runDueJobs).toHaveBeenCalledWith({
      limit: 25,
      workerId: 'external-worker',
    })
    expect(mocks.recordJobRunnerSuccess).toHaveBeenCalled()
  })

  it('records runner failure heartbeat when job execution fails', async () => {
    mocks.runDueJobs.mockRejectedValue(new Error('job execution crashed'))

    await expect(
      POST(
        new Request('http://localhost/api/jobs/run?workerId=external-worker', {
          method: 'POST',
          headers: {
            authorization: 'Bearer job-runner-secret-value',
          },
        })
      )
    ).rejects.toThrow('job execution crashed')

    expect(mocks.recordJobRunnerFailure).toHaveBeenCalledWith(
      'external-worker',
      expect.objectContaining({
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
        error: expect.any(Error),
      })
    )
  })
})

vi.mock('@/server/checkout/shipping-quote-cache', () => ({ pruneExpiredCheckoutShippingQuotes: vi.fn().mockResolvedValue(0) }))

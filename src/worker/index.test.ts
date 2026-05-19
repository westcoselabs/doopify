import { describe, expect, it, vi } from 'vitest'

import { runWorker } from './index'

describe('worker entrypoint', () => {
  it('runs one pass and exits in once mode', async () => {
    const runPass = vi.fn().mockResolvedValue({
      worker: 'doopify-worker',
      mode: 'once',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [],
    })
    const sleepFn = vi.fn().mockResolvedValue(undefined)

    await runWorker({
      env: {
        DOOPIFY_WORKER_BASE_URL: 'https://shop.example.com',
        WEBHOOK_RETRY_SECRET: 'retry-secret-123456',
        JOB_RUNNER_SECRET: 'jobs-secret-123456',
        ABANDONED_CHECKOUT_SECRET: 'abandoned-secret-123456',
      } as NodeJS.ProcessEnv,
      argv: ['--once'],
      runPass,
      sleepFn,
      logger: () => {},
    })

    expect(runPass).toHaveBeenCalledTimes(1)
    expect(sleepFn).not.toHaveBeenCalled()
  })
})


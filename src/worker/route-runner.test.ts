import { describe, expect, it, vi } from 'vitest'

import { buildRouteTargets, buildWorkerConfig, runWorkerPass, type WorkerLogEntry } from './route-runner'

describe('worker route runner', () => {
  it('builds expected endpoint URLs for all runner routes', () => {
    const config = buildWorkerConfig(
      {
        DOOPIFY_WORKER_BASE_URL: 'https://shop.example.com/',
        WEBHOOK_RETRY_SECRET: 'retry-secret-123456',
        JOB_RUNNER_SECRET: 'jobs-secret-123456',
        ABANDONED_CHECKOUT_SECRET: 'abandoned-secret-123456',
      } as NodeJS.ProcessEnv,
      ['--once']
    )

    const targets = buildRouteTargets(config)
    expect(targets.map((target) => target.path)).toEqual([
      `/api/jobs/run?runnerName=${encodeURIComponent(config.workerName)}`,
      '/api/webhook-retries/run',
      '/api/abandoned-checkouts/send-due',
    ])
  })

  it('sends bearer auth headers matching existing runner route auth expectations', async () => {
    const config = buildWorkerConfig(
      {
        DOOPIFY_WORKER_BASE_URL: 'https://shop.example.com',
        WEBHOOK_RETRY_SECRET: 'retry-secret-123456',
        JOB_RUNNER_SECRET: 'jobs-secret-123456',
        ABANDONED_CHECKOUT_SECRET: 'abandoned-secret-123456',
      } as NodeJS.ProcessEnv,
      ['--once']
    )

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await runWorkerPass(config, { fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer jobs-secret-123456',
      }),
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer retry-secret-123456',
      }),
    })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer abandoned-secret-123456',
      }),
    })
  })

  it('continues calling remaining routes when one route fails', async () => {
    const config = buildWorkerConfig(
      {
        DOOPIFY_WORKER_BASE_URL: 'https://shop.example.com',
        WEBHOOK_RETRY_SECRET: 'retry-secret-123456',
        JOB_RUNNER_SECRET: 'jobs-secret-123456',
        ABANDONED_CHECKOUT_SECRET: 'abandoned-secret-123456',
      } as NodeJS.ProcessEnv,
      ['--once']
    )

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const result = await runWorkerPass(config, { fetchImpl: fetchMock })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.results).toHaveLength(3)
    expect(result.results[0]?.ok).toBe(true)
    expect(result.results[1]?.ok).toBe(false)
    expect(result.results[2]?.ok).toBe(true)
  })

  it('logs without exposing secrets', async () => {
    const secretA = 'jobs-secret-123456'
    const secretB = 'retry-secret-123456'
    const secretC = 'abandoned-secret-123456'
    const config = buildWorkerConfig(
      {
        DOOPIFY_WORKER_BASE_URL: 'https://shop.example.com',
        WEBHOOK_RETRY_SECRET: secretB,
        JOB_RUNNER_SECRET: secretA,
        ABANDONED_CHECKOUT_SECRET: secretC,
      } as NodeJS.ProcessEnv,
      ['--once']
    )

    const logs: WorkerLogEntry[] = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await runWorkerPass(config, {
      fetchImpl: fetchMock,
      logger: (entry) => logs.push(entry),
    })

    const joinedLogs = JSON.stringify(logs)
    expect(joinedLogs).not.toContain(secretA)
    expect(joinedLogs).not.toContain(secretB)
    expect(joinedLogs).not.toContain(secretC)
  })
})


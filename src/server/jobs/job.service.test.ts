import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobStatus } from '@prisma/client'

type JobRecord = {
  id: string
  type: string
  payload: unknown
  status: JobStatus
  attempts: number
  maxAttempts: number
  runAt: Date
  lockedAt: Date | null
  lockedBy: string | null
  claimToken: string | null
  leaseExpiresAt: Date | null
  processedAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

const state = vi.hoisted(() => ({
  jobs: [] as JobRecord[],
  id: 0,
}))

function nowDate() {
  return new Date()
}

function cloneJob(job: JobRecord) {
  return {
    ...job,
    runAt: new Date(job.runAt),
    lockedAt: job.lockedAt ? new Date(job.lockedAt) : null,
    processedAt: job.processedAt ? new Date(job.processedAt) : null,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
  }
}

function matchesWhere(job: JobRecord, where: Record<string, any> | undefined): boolean {
  if (!where) return true
  if (where.OR && !where.OR.some((clause: any) => matchesWhere(job, clause))) return false
  if (where.claimToken !== undefined && where.claimToken !== job.claimToken) return false
  if (where.leaseExpiresAt === null && job.leaseExpiresAt !== null) return false
  if (where.leaseExpiresAt?.lte && (!job.leaseExpiresAt || job.leaseExpiresAt > where.leaseExpiresAt.lte)) return false
  if (where.leaseExpiresAt?.gt && (!job.leaseExpiresAt || job.leaseExpiresAt <= where.leaseExpiresAt.gt)) return false
  if (where.lockedAt?.lte && (!job.lockedAt || job.lockedAt > where.lockedAt.lte)) return false

  if (where.id && job.id !== where.id) return false
  if (where.type && job.type !== where.type) return false
  if (where.status) {
    if (typeof where.status === 'string' && job.status !== where.status) return false
    if (where.status.in && !where.status.in.includes(job.status)) return false
  }
  if (where.runAt?.lte && job.runAt > where.runAt.lte) return false
  if (Object.hasOwn(where, 'lockedAt')) {
    if (where.lockedAt === null && job.lockedAt !== null) return false
  }

  return true
}

function applyJobUpdate(job: JobRecord, data: Record<string, any>) {
  if (Object.hasOwn(data, 'claimToken')) job.claimToken = data.claimToken
  if (Object.hasOwn(data, 'leaseExpiresAt')) job.leaseExpiresAt = data.leaseExpiresAt
  if (data.status !== undefined) job.status = data.status
  if (data.payload !== undefined) job.payload = data.payload
  if (data.type !== undefined) job.type = data.type
  if (data.maxAttempts !== undefined) job.maxAttempts = data.maxAttempts
  if (data.runAt !== undefined) job.runAt = data.runAt
  if (Object.hasOwn(data, 'lockedAt')) job.lockedAt = data.lockedAt
  if (Object.hasOwn(data, 'lockedBy')) job.lockedBy = data.lockedBy
  if (Object.hasOwn(data, 'processedAt')) job.processedAt = data.processedAt
  if (Object.hasOwn(data, 'lastError')) job.lastError = data.lastError
  if (data.attempts?.increment) job.attempts += data.attempts.increment
  job.updatedAt = nowDate()
}

const prismaMock = vi.hoisted(() => ({
  job: {
    create: vi.fn(async ({ data }: { data: any }) => {
      state.id += 1
      const job: JobRecord = {
        id: `job_${state.id}`,
        type: data.type,
        payload: data.payload,
        status: data.status ?? 'PENDING',
        attempts: data.attempts ?? 0,
        maxAttempts: data.maxAttempts ?? 5,
        runAt: data.runAt ?? nowDate(),
        lockedAt: null,
        lockedBy: null,
        claimToken: null,
        leaseExpiresAt: null,
        processedAt: null,
        lastError: null,
        createdAt: nowDate(),
        updatedAt: nowDate(),
      }
      state.jobs.push(job)
      return cloneJob(job)
    }),
    findMany: vi.fn(async ({ where, take, skip = 0, select }: { where?: any; take?: number; skip?: number; select?: any }) => {
      const filtered = state.jobs.filter((job) => matchesWhere(job, where))
      const sorted = filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      const paged = sorted.slice(skip, typeof take === 'number' ? skip + take : undefined)
      if (select?.id) {
        return paged.map((job) => ({ id: job.id }))
      }
      return paged.map(cloneJob)
    }),
    findFirst: vi.fn(async ({ where }: { where: any }) => {
      const job = state.jobs.find((candidate) => matchesWhere(candidate, where))
      return job ? cloneJob(job) : null
    }),
    updateManyAndReturn: vi.fn(async ({ where, data }: { where: any; data: any }) => {
      const jobs = state.jobs.filter((job) => matchesWhere(job, where))
      jobs.forEach((job) => applyJobUpdate(job, data))
      return jobs.map(cloneJob)
    }),
    updateMany: vi.fn(async ({ where, data }: { where?: any; data: any }) => {
      let count = 0
      for (const job of state.jobs) {
        if (!matchesWhere(job, where)) continue
        applyJobUpdate(job, data)
        count += 1
      }
      return { count }
    }),
    findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: any }) => {
      const job = state.jobs.find((candidate) => candidate.id === where.id)
      if (!job) return null
      if (select?.attempts || select?.maxAttempts) {
        return {
          ...(select.attempts ? { attempts: job.attempts } : {}),
          ...(select.maxAttempts ? { maxAttempts: job.maxAttempts } : {}),
        }
      }
      return cloneJob(job)
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const job = state.jobs.find((candidate) => candidate.id === where.id)
      if (!job) throw new Error('Job not found')
      applyJobUpdate(job, data)
      return cloneJob(job)
    }),
    count: vi.fn(async ({ where }: { where?: any } = {}) => {
      return state.jobs.filter((job) => matchesWhere(job, where)).length
    }),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const jobHandlerMocks = vi.hoisted(() => ({
  getJobHandler: vi.fn(),
}))

vi.mock('@/server/jobs/registry', () => ({
  getJobHandler: jobHandlerMocks.getJobHandler,
}))

import {
  claimDueJobs,
  enqueueJob,
  getJob,
  runDueJobs,
  markJobSuccess,
  cancelJob,
} from './job.service'

describe('job service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.jobs.length = 0
    state.id = 0
  })

  it('enqueueJob creates a pending job', async () => {
    const job = await enqueueJob('TEST_JOB', { orderId: 'order_1' } as any)

    expect(job.status).toBe('PENDING')
    expect(job.type).toBe('TEST_JOB')
    expect(job.attempts).toBe(0)
    expect(job.maxAttempts).toBe(5)
  })

  it('runDueJobs claims and runs due jobs', async () => {
    const handler = vi.fn(async () => {})
    jobHandlerMocks.getJobHandler.mockReturnValue(handler)

    await enqueueJob('TEST_JOB', { id: 'a' } as any, { runAt: new Date(Date.now() - 1000) })
    const result = await runDueJobs({ limit: 10, workerId: 'worker-1' })
    const job = await getJob('job_1')

    expect(result.processed).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(job?.status).toBe('SUCCESS')
  })

  it('prevents duplicate processing after one worker claims a due job', async () => {
    const handler = vi.fn(async () => {})
    jobHandlerMocks.getJobHandler.mockReturnValue(handler)

    await enqueueJob('TEST_JOB', { id: 'b' } as any, { runAt: new Date(Date.now() - 1000) })
    const firstClaim = await claimDueJobs(1, { workerId: 'worker-1' })
    const secondClaim = await claimDueJobs(1, { workerId: 'worker-2' })

    expect(firstClaim).toHaveLength(1)
    expect(secondClaim).toHaveLength(0)
  })

  it('schedules retry when a job handler fails', async () => {
    const handler = vi.fn(async () => {
      throw new Error('temporary provider outage')
    })
    jobHandlerMocks.getJobHandler.mockReturnValue(handler)

    await enqueueJob('TEST_JOB', { id: 'c' } as any, { runAt: new Date(Date.now() - 1000), maxAttempts: 3 })
    const result = await runDueJobs({ workerId: 'worker-1' })
    const job = await getJob('job_1')

    expect(result.failed).toBe(1)
    expect(job?.status).toBe('RETRYING')
    expect(job?.attempts).toBe(1)
    expect(job?.lastError).toContain('temporary provider outage')
  })

  it('marks a repeatedly failing job as exhausted after max attempts', async () => {
    const handler = vi.fn(async () => {
      throw new Error('permanent failure')
    })
    jobHandlerMocks.getJobHandler.mockReturnValue(handler)

    await enqueueJob('TEST_JOB', { id: 'd' } as any, {
      runAt: new Date(Date.now() - 1000),
      maxAttempts: 2,
    })

    await runDueJobs({ workerId: 'worker-1' })
    state.jobs[0].runAt = new Date(Date.now() - 1000)
    await runDueJobs({ workerId: 'worker-1' })
    const job = await getJob('job_1')

    expect(job?.status).toBe('EXHAUSTED')
    expect(job?.attempts).toBe(2)
  })

  it('fails safely when payload does not match handler schema', async () => {
    jobHandlerMocks.getJobHandler.mockReturnValue(async (payload: unknown) => {
      if (!payload || typeof payload !== 'object' || !('deliveryId' in payload)) {
        throw new Error('Invalid payload')
      }
    })

    await enqueueJob('SEND_ORDER_CONFIRMATION_EMAIL', { noDeliveryId: true } as any, {
      runAt: new Date(Date.now() - 1000),
      maxAttempts: 2,
    })

    await runDueJobs({ workerId: 'worker-1' })
    state.jobs[0].runAt = new Date(Date.now() - 1000)
    await runDueJobs({ workerId: 'worker-1' })
    const job = await getJob('job_1')

    expect(job?.status).toBe('EXHAUSTED')
    expect(job?.lastError).toContain('Invalid payload')
  })
  it('reclaims an expired worker while fencing its late completion', async () => {
    await enqueueJob('TEST_JOB', {})
    const [first] = await claimDueJobs(1)
    state.jobs[0].leaseExpiresAt = new Date(Date.now() - 1)
    const [second] = await claimDueJobs(1)
    expect(second.claimToken).not.toBe(first.claimToken)
    await expect(markJobSuccess(first.id, first.claimToken!)).rejects.toThrow('ownership changed')
    expect((await markJobSuccess(second.id, second.claimToken!)).status).toBe('SUCCESS')
    expect(second.attempts).toBe(2)
  })

  it('does not cancel an active job or expose its ownership token', async () => {
    const job = await enqueueJob('TEST_JOB', { secret: 'private' })
    await claimDueJobs(1)
    expect(await cancelJob(job.id)).toBeNull()
    expect(await getJob(job.id)).not.toHaveProperty('claimToken')
    expect((await getJob(job.id))?.payload).toEqual({ secret: '[REDACTED]' })
  })

})

import crypto from 'node:crypto'
import { DELIVERY_LEASE_MS, runBounded } from '@/server/jobs/delivery-runtime'
import type { Job, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_RUN_LIMIT = 25
const MAX_RUN_LIMIT = 100
const BASE_RETRY_DELAY_MS = 60 * 1000
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000


const SENSITIVE_KEY_PATTERN = /secret|token|password|authorization|api[-_]?key|signature/i

export type EnqueueJobOptions = {
  runAt?: Date
  maxAttempts?: number
}

export type ClaimDueJobsOptions = {
  workerId?: string
  now?: Date
}

export type RunJobOptions = {
  workerId?: string
  now?: Date
  claimToken?: string
}

export type RunDueJobsOptions = {
  limit?: number
  workerId?: string
  now?: Date
}

export type GetJobsFilters = {
  status?: Job['status'] | 'ALL'
  type?: string
  page?: number
  pageSize?: number
}

export type SafeJob = Omit<Job, 'payload' | 'claimToken'> & {
  payload: unknown
}

export type JobRunResult = {
  processed: boolean
  success: boolean
  job: SafeJob | null
  error?: string
  skippedReason?: 'NOT_FOUND' | 'NOT_DUE' | 'NOT_CLAIMED'
}

function clampLimit(limit: number | undefined) {
  if (!limit) return DEFAULT_RUN_LIMIT
  return Math.max(1, Math.min(MAX_RUN_LIMIT, limit))
}

function getWorkerId(workerId: string | undefined) {
  if (workerId) return workerId
  return `worker:${process.pid}:${Math.random().toString(36).slice(2, 10)}`
}

function normalizeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Job processing failed'
  return message.slice(0, 4000)
}

function calculateRetryRunAt(attempt: number, now = new Date()) {
  const delayMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)))
  return new Date(now.getTime() + delayMs)
}

function sanitizeJobPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((value) => sanitizeJobPayload(value))
  }

  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const objectPayload = payload as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(objectPayload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    sanitized[key] = sanitizeJobPayload(value)
  }

  return sanitized
}

function toSafeJob(job: Job): SafeJob {
  const { claimToken: _claimToken, ...safeJob } = job
  return {
    ...safeJob,
    payload: sanitizeJobPayload(job.payload),
  }
}

function dueJobsWhere(now: Date): Prisma.JobWhereInput {
  return { OR: [
    { status: { in: ['PENDING', 'RETRYING'] }, runAt: { lte: now }, claimToken: null },
    { status: 'RUNNING', OR: [
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, lockedAt: { lte: new Date(now.getTime() - DELIVERY_LEASE_MS) } },
    ] },
  ] }
}

export type JobClaim = { jobId: string; claimToken: string }
export class JobClaimLostError extends Error {}
export class PermanentJobError extends Error {}

export async function assertJobClaim(claim: JobClaim, client: Pick<Prisma.TransactionClient, 'job'> = prisma) {
  // A write also locks the job row through a caller's transaction, preventing a
  // lease takeover between this ownership check and a dependent delivery write.
  const owned = await client.job.updateMany({ where: { id: claim.jobId, claimToken: claim.claimToken, status: 'RUNNING', leaseExpiresAt: { gt: new Date() } }, data: { claimToken: claim.claimToken } })
  if (owned.count !== 1) throw new JobClaimLostError('Job claim expired or ownership changed')
}

export async function enqueueJob(type: string, payload: Prisma.InputJsonValue, options: EnqueueJobOptions = {}, client: Pick<Prisma.TransactionClient, 'job'> = prisma) {
  return client.job.create({ data: { type, payload, status: 'PENDING', maxAttempts: Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS), runAt: options.runAt ?? new Date() } })
}

async function claimJob(id: string, workerId: string, now: Date) {
  const [job] = await prisma.job.updateManyAndReturn({
    where: { id, ...dueJobsWhere(now) },
    data: { status: 'RUNNING', lockedAt: now, lockedBy: workerId, claimToken: crypto.randomUUID(), leaseExpiresAt: new Date(now.getTime() + DELIVERY_LEASE_MS), attempts: { increment: 1 } },
  })
  return job ?? null
}

export async function claimDueJobs(limit = DEFAULT_RUN_LIMIT, options: ClaimDueJobsOptions = {}) {
  const now = options.now ?? new Date()
  const jobs = await prisma.job.findMany({ where: dueJobsWhere(now), select: { id: true }, orderBy: [{ runAt: 'asc' }, { id: 'asc' }], take: clampLimit(limit) })
  const claimed: Job[] = []
  for (const job of jobs) {
    const owned = await claimJob(job.id, getWorkerId(options.workerId), now)
    if (owned) claimed.push(owned)
  }
  return claimed
}

async function finishJob(jobId: string, claimToken: string, data: Prisma.JobUpdateManyMutationInput) {
  const [job] = await prisma.job.updateManyAndReturn({
    where: { id: jobId, status: 'RUNNING', claimToken, leaseExpiresAt: { gt: new Date() } },
    data: { ...data, claimToken: null, leaseExpiresAt: null, lockedAt: null, lockedBy: null },
  })
  if (!job) throw new JobClaimLostError('Job claim expired or ownership changed')
  return job
}

export async function markJobSuccess(jobId: string, claimToken: string) {
  return finishJob(jobId, claimToken, { status: 'SUCCESS', processedAt: new Date(), lastError: null })
}

export async function markJobFailed(jobId: string, error: unknown, claimToken: string) {
  return finishJob(jobId, claimToken, { status: 'FAILED', processedAt: new Date(), lastError: normalizeError(error) })
}

export async function scheduleRetry(jobId: string, error: unknown, claimToken: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) throw new JobClaimLostError('Job no longer exists')
  const exhausted = job.attempts >= job.maxAttempts
  return finishJob(jobId, claimToken, { status: exhausted ? 'EXHAUSTED' : 'RETRYING', processedAt: exhausted ? new Date() : null, runAt: calculateRetryRunAt(job.attempts), lastError: normalizeError(error) })
}

export async function runJob(jobId: string, options: RunJobOptions = {}): Promise<JobRunResult> {
  const job = options.claimToken
    ? await prisma.job.findFirst({ where: { id: jobId, status: 'RUNNING', claimToken: options.claimToken, leaseExpiresAt: { gt: new Date() } } })
    : await claimJob(jobId, getWorkerId(options.workerId), options.now ?? new Date())
  if (!job?.claimToken) return { processed: false, success: false, job: null, skippedReason: 'NOT_CLAIMED' }
  const { getJobHandler } = await import('@/server/jobs/registry')
  const handler = getJobHandler(job.type)
  try {
    if (job.attempts > job.maxAttempts) {
      const exhausted = await finishJob(job.id, job.claimToken, { status: 'EXHAUSTED', processedAt: new Date(), lastError: 'Attempt limit reached after expired worker claim' })
      return { processed: true, success: false, job: toSafeJob(exhausted) }
    }
    if (!handler) throw new PermanentJobError('No handler registered for job type: ' + job.type)
    await handler(job.payload, { jobId: job.id, claimToken: job.claimToken })
    return { processed: true, success: true, job: toSafeJob(await markJobSuccess(job.id, job.claimToken)) }
  } catch (error) {
    if (error instanceof JobClaimLostError) return { processed: true, success: false, job: null, error: normalizeError(error) }
    try {
      const failed = error instanceof PermanentJobError
        ? await markJobFailed(job.id, error, job.claimToken)
        : await scheduleRetry(job.id, error, job.claimToken)
      return { processed: true, success: false, job: toSafeJob(failed), error: normalizeError(error) }
    } catch (finishError) {
      if (!(finishError instanceof JobClaimLostError)) throw finishError
      return { processed: true, success: false, job: null, error: normalizeError(finishError) }
    }
  }
}

export async function runDueJobs(options: RunDueJobsOptions = {}) {
  const jobs = await prisma.job.findMany({ where: dueJobsWhere(options.now ?? new Date()), select: { id: true }, orderBy: [{ runAt: 'asc' }, { id: 'asc' }], take: clampLimit(options.limit) })
  const settled = await runBounded(jobs, (job) => runJob(job.id, { workerId: options.workerId, now: options.now }))
  const results: JobRunResult[] = settled.map((result) => result.status === 'fulfilled' ? result.value : { processed: true, success: false, job: null, error: normalizeError(result.reason) })
  return { processed: results.filter((result) => result.processed).length, succeeded: results.filter((result) => result.success).length, failed: results.filter((result) => result.processed && !result.success).length, skipped: results.filter((result) => !result.processed).length, results }
}

export async function getJobs(filters: GetJobsFilters = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const pageSize = Math.max(1, Math.min(100, Math.floor(filters.pageSize ?? 20)))
  const where: Prisma.JobWhereInput = {
    ...(filters.status && filters.status !== 'ALL' ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  }

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ runAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    jobs: jobs.map(toSafeJob),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getJob(id: string) {
  const job = await prisma.job.findUnique({
    where: { id },
  })

  return job ? toSafeJob(job) : null
}

export async function retryJob(id: string) {
  const retried = await prisma.job.updateMany({
    where: {
      id,
      status: { in: ['FAILED', 'EXHAUSTED', 'CANCELLED', 'RETRYING'] },
      claimToken: null,
    },
    data: {
      status: 'PENDING',
      attempts: 0,
      runAt: new Date(),
      processedAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  })

  if (retried.count === 0) return null
  return getJob(id)
}

export async function cancelJob(id: string) {
  const cancelled = await prisma.job.updateMany({
    where: {
      id,
      status: { in: ['PENDING', 'RETRYING', 'FAILED'] },
      claimToken: null,
    },
    data: {
      status: 'CANCELLED',
      processedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  })

  if (cancelled.count === 0) return null
  return getJob(id)
}

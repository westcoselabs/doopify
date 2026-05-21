import type { JobStatus, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { listJobRunnerHeartbeats } from '@/server/jobs/job-runner-heartbeat.service'

const EMAIL_JOB_TYPES = ['SEND_ORDER_CONFIRMATION_EMAIL', 'SEND_FULFILLMENT_EMAIL'] as const
const QUEUED_STATUSES: JobStatus[] = ['PENDING', 'RETRYING']
const FAILED_STATUSES: JobStatus[] = ['FAILED', 'EXHAUSTED']

const WARNING_DUE_THRESHOLD = 5
const CRITICAL_DUE_THRESHOLD = 25
const WARNING_FAILED_THRESHOLD = 1
const CRITICAL_FAILED_THRESHOLD = 5
const WARNING_AGE_MINUTES = 10
const CRITICAL_AGE_MINUTES = 30
const RUNNER_STALE_MINUTES = 10

export type EmailJobHealthLevel = 'healthy' | 'warning' | 'critical'
export type EmailJobRunnerHealth = 'healthy' | 'failing' | 'idle' | 'stale'

export type EmailJobHealthSnapshot = {
  level: EmailJobHealthLevel
  message: string
  queuedCount: number
  dueCount: number
  runningCount: number
  failedCount: number
  oldestDueAgeMinutes: number | null
  runner: {
    health: EmailJobRunnerHealth
    totalRunners: number
    failingRunners: number
    latestSeenAt: string | null
  }
  thresholds: {
    warningDue: number
    criticalDue: number
    warningFailed: number
    criticalFailed: number
    warningAgeMinutes: number
    criticalAgeMinutes: number
    runnerStaleMinutes: number
  }
}

type EmailJobHealthInput = {
  dueCount: number
  failedCount: number
  oldestDueAgeMinutes: number | null
  runnerHealth: EmailJobRunnerHealth
}

export function evaluateEmailJobHealth(input: EmailJobHealthInput): {
  level: EmailJobHealthLevel
  message: string
} {
  const details: string[] = []
  if (input.dueCount > 0) details.push(`${input.dueCount} due email job(s)`)
  if (input.failedCount > 0) details.push(`${input.failedCount} failed/exhausted email job(s)`)
  if (input.oldestDueAgeMinutes != null) details.push(`oldest due job age ${input.oldestDueAgeMinutes}m`)
  if (input.runnerHealth !== 'healthy') details.push(`runner health ${input.runnerHealth}`)

  const criticalByCounts =
    input.dueCount >= CRITICAL_DUE_THRESHOLD ||
    input.failedCount >= CRITICAL_FAILED_THRESHOLD ||
    (input.oldestDueAgeMinutes != null && input.oldestDueAgeMinutes >= CRITICAL_AGE_MINUTES)

  const criticalByRunner =
    input.dueCount > 0 &&
    (input.runnerHealth === 'failing' ||
      (input.runnerHealth === 'stale' &&
        input.oldestDueAgeMinutes != null &&
        input.oldestDueAgeMinutes >= WARNING_AGE_MINUTES) ||
      input.runnerHealth === 'idle')

  if (criticalByCounts || criticalByRunner) {
    return {
      level: 'critical',
      message: details.length
        ? `Email delivery processing needs attention: ${details.join(' · ')}.`
        : 'Email delivery processing needs attention.',
    }
  }

  const warningByCounts =
    input.dueCount >= WARNING_DUE_THRESHOLD ||
    input.failedCount >= WARNING_FAILED_THRESHOLD ||
    (input.oldestDueAgeMinutes != null && input.oldestDueAgeMinutes >= WARNING_AGE_MINUTES)

  const warningByRunner = input.dueCount > 0 && input.runnerHealth !== 'healthy'

  if (warningByCounts || warningByRunner) {
    return {
      level: 'warning',
      message: details.length
        ? `Email delivery processing may be delayed: ${details.join(' · ')}.`
        : 'Email delivery processing may be delayed.',
    }
  }

  return {
    level: 'healthy',
    message: 'Email delivery processing is healthy.',
  }
}

function minutesBetween(newer: Date, older: Date) {
  return Math.max(0, Math.floor((newer.getTime() - older.getTime()) / 60_000))
}

function resolveRunnerHealth(input: {
  totalRunners: number
  failingRunners: number
  latestSeenAt: Date | null
  now: Date
}) {
  if (input.totalRunners === 0) return 'idle' as const
  if (input.failingRunners > 0) return 'failing' as const
  if (!input.latestSeenAt) return 'idle' as const
  if (minutesBetween(input.now, input.latestSeenAt) > RUNNER_STALE_MINUTES) return 'stale' as const
  return 'healthy' as const
}

export async function getEmailJobHealthSnapshot(now = new Date()): Promise<EmailJobHealthSnapshot> {
  const whereEmailJobs: Prisma.JobWhereInput = {
    type: {
      in: [...EMAIL_JOB_TYPES],
    },
  }

  const [queuedCount, dueCount, runningCount, failedCount, oldestDueJob, runners] = await Promise.all([
    prisma.job.count({
      where: {
        ...whereEmailJobs,
        status: { in: QUEUED_STATUSES },
      },
    }),
    prisma.job.count({
      where: {
        ...whereEmailJobs,
        status: { in: QUEUED_STATUSES },
        runAt: { lte: now },
      },
    }),
    prisma.job.count({
      where: {
        ...whereEmailJobs,
        status: 'RUNNING',
      },
    }),
    prisma.job.count({
      where: {
        ...whereEmailJobs,
        status: { in: FAILED_STATUSES },
      },
    }),
    prisma.job.findFirst({
      where: {
        ...whereEmailJobs,
        status: { in: QUEUED_STATUSES },
        runAt: { lte: now },
      },
      select: {
        runAt: true,
      },
      orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
    }),
    listJobRunnerHeartbeats(),
  ])

  const oldestDueAgeMinutes = oldestDueJob?.runAt ? minutesBetween(now, oldestDueJob.runAt) : null
  const latestSeenAt = runners
    .map((runner) => runner.lastSeenAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  const runner = {
    health: resolveRunnerHealth({
      totalRunners: runners.length,
      failingRunners: runners.filter((runner) => runner.health === 'failing').length,
      latestSeenAt,
      now,
    }),
    totalRunners: runners.length,
    failingRunners: runners.filter((runner) => runner.health === 'failing').length,
    latestSeenAt: latestSeenAt ? latestSeenAt.toISOString() : null,
  }

  const evaluation = evaluateEmailJobHealth({
    dueCount,
    failedCount,
    oldestDueAgeMinutes,
    runnerHealth: runner.health,
  })

  return {
    level: evaluation.level,
    message: evaluation.message,
    queuedCount,
    dueCount,
    runningCount,
    failedCount,
    oldestDueAgeMinutes,
    runner,
    thresholds: {
      warningDue: WARNING_DUE_THRESHOLD,
      criticalDue: CRITICAL_DUE_THRESHOLD,
      warningFailed: WARNING_FAILED_THRESHOLD,
      criticalFailed: CRITICAL_FAILED_THRESHOLD,
      warningAgeMinutes: WARNING_AGE_MINUTES,
      criticalAgeMinutes: CRITICAL_AGE_MINUTES,
      runnerStaleMinutes: RUNNER_STALE_MINUTES,
    },
  }
}

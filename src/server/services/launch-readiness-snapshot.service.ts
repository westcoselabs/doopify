import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { LaunchReadinessRunResult } from '@/server/services/launch-readiness-runner.service'

const DEFAULT_SCOPE = 'default'

type LaunchReadinessSnapshotState = 'first_run' | 'saved'

export type LaunchReadinessSnapshotPayload = LaunchReadinessRunResult & {
  snapshotState: LaunchReadinessSnapshotState
  firstRun: boolean
  firstRunMessage: string | null
  lastRunAt: string | null
  snapshotSavedAt: string | null
}

function buildBaseSummary() {
  return {
    launchReady: false,
    total: 0,
    ready: 0,
    blockers: 0,
    warnings: 0,
    optional: 0,
    checkedAt: '',
  }
}

export function buildFirstRunLaunchReadinessSnapshot(): LaunchReadinessSnapshotPayload {
  const summary = buildBaseSummary()

  return {
    snapshotState: 'first_run',
    firstRun: true,
    firstRunMessage: 'No launch check has been run yet.',
    lastRunAt: null,
    snapshotSavedAt: null,
    checkedAt: '',
    checks: [],
    summary,
    readyCount: 0,
    needsSetupCount: 0,
    optionalCount: 0,
    skippedCount: 0,
    warningCount: 0,
    blockerCount: 0,
    launchReady: false,
    signals: undefined,
  }
}

function toSavedPayload(
  payload: LaunchReadinessRunResult,
  checkedAt: Date,
  snapshotSavedAt: Date
): LaunchReadinessSnapshotPayload {
  return {
    ...payload,
    snapshotState: 'saved',
    firstRun: false,
    firstRunMessage: null,
    lastRunAt: checkedAt.toISOString(),
    snapshotSavedAt: snapshotSavedAt.toISOString(),
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseSnapshotPayload(value: unknown): LaunchReadinessRunResult | null {
  if (!isObjectRecord(value)) return null
  if (!Array.isArray(value.checks)) return null
  if (!isObjectRecord(value.summary)) return null

  return value as unknown as LaunchReadinessRunResult
}

function maskError(error: unknown) {
  if (!(error instanceof Error)) return 'Unknown error'
  const message = String(error.message || '')
  return message
    .replace(/(sk|pk|whsec|re)_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 220)
}

export function isLaunchReadinessSnapshotTableMissingError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P2021', 'P2022'].includes(error.code)
  }

  const message = error instanceof Error ? error.message : String(error)
  return /launch_readiness_snapshots/i.test(message) && /(does not exist|relation|table|column|query)/i.test(message)
}

function isExpectedSnapshotReadFailure(error: unknown) {
  if (isLaunchReadinessSnapshotTableMissingError(error)) {
    return true
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true
  }

  return false
}

export async function getLatestLaunchReadinessSnapshot() {
  let snapshot: {
    payload: Prisma.JsonValue
    checkedAt: Date
    updatedAt: Date
  } | null = null

  try {
    snapshot = await prisma.launchReadinessSnapshot.findUnique({
      where: { scope: DEFAULT_SCOPE },
      select: {
        payload: true,
        checkedAt: true,
        updatedAt: true,
      },
    })
  } catch (error) {
    if (isExpectedSnapshotReadFailure(error)) {
      console.warn('[launch-readiness-snapshot] snapshot read fallback', maskError(error))
      return buildFirstRunLaunchReadinessSnapshot()
    }
    throw error
  }

  if (!snapshot) {
    return buildFirstRunLaunchReadinessSnapshot()
  }

  const parsedPayload = parseSnapshotPayload(snapshot.payload)
  if (!parsedPayload) {
    return buildFirstRunLaunchReadinessSnapshot()
  }

  return toSavedPayload(parsedPayload, snapshot.checkedAt, snapshot.updatedAt)
}

export async function saveLaunchReadinessSnapshot(input: {
  payload: LaunchReadinessRunResult
  runByUserId: string
}) {
  const checkedAt = input.payload.checkedAt ? new Date(input.payload.checkedAt) : new Date()
  const payloadJson = input.payload as unknown as Prisma.InputJsonValue

  const snapshot = await prisma.launchReadinessSnapshot.upsert({
    where: { scope: DEFAULT_SCOPE },
    update: {
      payload: payloadJson,
      checkedAt,
      runByUserId: input.runByUserId,
    },
    create: {
      scope: DEFAULT_SCOPE,
      payload: payloadJson,
      checkedAt,
      runByUserId: input.runByUserId,
    },
    select: {
      payload: true,
      checkedAt: true,
      updatedAt: true,
    },
  })

  const parsedPayload = parseSnapshotPayload(snapshot.payload)
  if (!parsedPayload) {
    return buildFirstRunLaunchReadinessSnapshot()
  }

  return toSavedPayload(parsedPayload, snapshot.checkedAt, snapshot.updatedAt)
}

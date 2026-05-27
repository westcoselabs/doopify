import { err, ok } from '@/lib/api'
import { requireOwner } from '@/server/auth/require-auth'
import { runLaunchReadinessCheck } from '@/server/services/launch-readiness-runner.service'
import {
  isLaunchReadinessSnapshotTableMissingError,
  saveLaunchReadinessSnapshot,
} from '@/server/services/launch-readiness-snapshot.service'

export const runtime = 'nodejs'
const SAFE_RUN_FAILURE_MESSAGE =
  'Launch check could not complete. Try again after confirming migrations and diagnostics.'
const SAFE_SNAPSHOT_SAVE_FAILURE_MESSAGE =
  'Launch check ran, but the snapshot could not be saved. Try running it again.'
const MIGRATION_NEEDED_MESSAGE =
  'Launch check ran, but the snapshot could not be saved. Apply database migrations and try again.'

function maskError(error: unknown) {
  if (!(error instanceof Error)) return 'Unknown error'
  const message = String(error.message || '')
  return message.replace(/(sk|pk|whsec|re)_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 200)
}

function logRunFailure(stage: 'readiness_run_failed' | 'snapshot_save_failed' | 'migration_or_table_missing', error: unknown) {
  console.error('[POST /api/readiness/run]', {
    stage,
    error: maskError(error),
  })
}

export async function POST(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  let report: Awaited<ReturnType<typeof runLaunchReadinessCheck>>
  try {
    report = await runLaunchReadinessCheck()
  } catch (error) {
    logRunFailure('readiness_run_failed', error)
    return err(SAFE_RUN_FAILURE_MESSAGE, 500)
  }

  try {
    const snapshot = await saveLaunchReadinessSnapshot({
      payload: report,
      runByUserId: auth.user.id,
    })
    return ok(snapshot)
  } catch (error) {
    if (isLaunchReadinessSnapshotTableMissingError(error)) {
      logRunFailure('migration_or_table_missing', error)
      return err(MIGRATION_NEEDED_MESSAGE, 503)
    }

    logRunFailure('snapshot_save_failed', error)
    return err(SAFE_SNAPSHOT_SAVE_FAILURE_MESSAGE, 500)
  }
}

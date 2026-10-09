import { pruneExpiredCheckoutShippingQuotes } from '@/server/checkout/shipping-quote-cache'
import { err, ok } from '@/lib/api'
import { getJobRunnerSecret, isJobRunnerAuthorized } from '@/server/jobs/auth'
import {
  recordJobRunnerFailure,
  recordJobRunnerStart,
  recordJobRunnerSuccess,
} from '@/server/jobs/job-runner-heartbeat.service'
import { runDueJobs } from '@/server/jobs/job.service'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!getJobRunnerSecret()) {
    return err('Job runner secret is not configured', 503)
  }

  if (!isJobRunnerAuthorized(req)) {
    return err('Unauthorized', 401)
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 25)))
  const workerId = searchParams.get('workerId') || undefined
  const runnerName =
    searchParams.get('runnerName') || req.headers.get('x-job-runner-name') || workerId || 'jobs-run-route'
  const startedAt = new Date()

  try {
    await recordJobRunnerStart(runnerName, startedAt)
  } catch (error) {
    console.error('[POST /api/jobs/run] heartbeat start failed', error)
  }

  try {
    const result = await runDueJobs({ limit, workerId })
    await pruneExpiredCheckoutShippingQuotes()

    try {
      await recordJobRunnerSuccess(runnerName, {
        startedAt,
        finishedAt: new Date(),
      })
    } catch (error) {
      console.error('[POST /api/jobs/run] heartbeat success update failed', error)
    }

    return ok({
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
    })
  } catch (error) {
    try {
      await recordJobRunnerFailure(runnerName, {
        startedAt,
        finishedAt: new Date(),
        error,
      })
    } catch (heartbeatError) {
      console.error('[POST /api/jobs/run] heartbeat failure update failed', heartbeatError)
    }

    throw error
  }
}

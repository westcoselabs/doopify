import { pathToFileURL } from 'node:url'

// @ts-ignore Runtime worker execution uses Node strip-types and requires explicit .ts extension.
import {
  buildWorkerConfig,
  defaultWorkerLogger,
  runWorkerPass,
  type WorkerConfig,
  type WorkerLogEntry,
  type WorkerLogger,
} from './route-runner.ts'

type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>

type RunWorkerInput = {
  env?: NodeJS.ProcessEnv
  argv?: string[]
  logger?: WorkerLogger
  sleepFn?: SleepFn
  runPass?: typeof runWorkerPass
}

function parseSecretErrors(config: WorkerConfig): string[] {
  const errors: string[] = []
  if (!config.secrets.jobsRunner) {
    errors.push('Missing JOB_RUNNER_SECRET (or WEBHOOK_RETRY_SECRET fallback)')
  }
  if (!config.secrets.webhookRetry) {
    errors.push('Missing WEBHOOK_RETRY_SECRET')
  }
  if (!config.secrets.abandonedCheckout) {
    errors.push('Missing ABANDONED_CHECKOUT_SECRET (or WEBHOOK_RETRY_SECRET fallback)')
  }
  return errors
}

function makeLogger(config: WorkerConfig, logger: WorkerLogger) {
  return (entry: Omit<WorkerLogEntry, 'worker' | 'mode' | 'route' | 'timestamp'> & { route?: string }) => {
    logger({
      level: entry.level,
      worker: config.workerName,
      mode: config.mode,
      route: entry.route ?? 'worker',
      message: entry.message,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      ok: entry.ok,
      timestamp: new Date().toISOString(),
    })
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      cleanup()
      resolve()
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runWorker(input: RunWorkerInput = {}) {
  const env = input.env ?? process.env
  const argv = input.argv ?? process.argv.slice(2)
  const logger = input.logger ?? defaultWorkerLogger
  const sleepFn = input.sleepFn ?? sleep
  const runPass = input.runPass ?? runWorkerPass

  const config = buildWorkerConfig(env, argv)
  const log = makeLogger(config, logger)

  const secretErrors = parseSecretErrors(config)
  if (secretErrors.length > 0) {
    for (const message of secretErrors) {
      log({
        level: 'error',
        route: 'worker',
        message,
        ok: false,
      })
    }
    throw new Error('Worker configuration is incomplete')
  }

  const shutdownController = new AbortController()
  const handleShutdown = () => {
    shutdownController.abort()
    log({
      level: 'info',
      route: 'worker',
      message: 'Shutdown signal received',
      ok: true,
    })
  }

  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)

  try {
    log({
      level: 'info',
      route: 'worker',
      message: `Worker starting in ${config.mode} mode`,
      ok: true,
    })

    if (config.mode === 'once') {
      await runPass(config, { logger })
      log({
        level: 'info',
        route: 'worker',
        message: 'Worker completed once pass',
        ok: true,
      })
      return
    }

    while (!shutdownController.signal.aborted) {
      await runPass(config, { logger })
      if (shutdownController.signal.aborted) {
        break
      }
      await sleepFn(config.intervalMs, shutdownController.signal)
    }

    log({
      level: 'info',
      route: 'worker',
      message: 'Worker loop stopped gracefully',
      ok: true,
    })
  } finally {
    process.off('SIGINT', handleShutdown)
    process.off('SIGTERM', handleShutdown)
  }
}

function isCliEntrypoint() {
  const argvPath = process.argv[1]
  if (!argvPath) return false
  return pathToFileURL(argvPath).href === import.meta.url
}

if (isCliEntrypoint()) {
  runWorker().catch((error) => {
    console.error('[worker]', JSON.stringify({
      level: 'error',
      route: 'worker',
      message: error instanceof Error ? error.message : 'Worker failed',
      timestamp: new Date().toISOString(),
    }))
    process.exitCode = 1
  })
}

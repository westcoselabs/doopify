export type WorkerMode = 'once' | 'loop'

export type WorkerConfig = {
  baseUrl: string
  mode: WorkerMode
  intervalMs: number
  workerName: string
  secrets: {
    jobsRunner: string | null
    webhookRetry: string | null
    abandonedCheckout: string | null
  }
}

export type WorkerLogEntry = {
  level: 'info' | 'error'
  worker: string
  mode: WorkerMode
  route: string
  message: string
  statusCode?: number
  durationMs?: number
  ok?: boolean
  timestamp: string
}

export type WorkerLogger = (entry: WorkerLogEntry) => void

export type WorkerRouteResult = {
  route: string
  url: string
  ok: boolean
  statusCode: number | null
  durationMs: number
  error?: string
}

export type WorkerPassResult = {
  worker: string
  mode: WorkerMode
  startedAt: string
  completedAt: string
  results: WorkerRouteResult[]
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type RouteTarget = {
  route: string
  path: string
  secret: string | null
}

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_WORKER_NAME = 'doopify-worker'

function parseMode(raw: string | undefined): WorkerMode {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
  return normalized === 'once' ? 'once' : 'loop'
}

function parseIntervalMs(raw: string | undefined): number {
  const parsed = Number(raw ?? '')
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_MS
  }
  return Math.floor(parsed)
}

function normalizeBaseUrl(raw: string | undefined): string {
  const value = String(raw || '').trim()
  if (!value) {
    throw new Error('Missing worker base URL. Set DOOPIFY_WORKER_BASE_URL or NEXT_PUBLIC_STORE_URL.')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('Worker base URL is invalid. Expected absolute http(s) URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Worker base URL must use http or https protocol.')
  }

  return parsed.toString().replace(/\/+$/, '')
}

function parseWorkerName(raw: string | undefined): string {
  const value = String(raw || '').trim()
  return value || DEFAULT_WORKER_NAME
}

function parseModeFromArgv(argv: string[]): WorkerMode | null {
  if (argv.includes('--once')) return 'once'
  if (argv.includes('--loop')) return 'loop'
  return null
}

function toWorkerLog(
  config: Pick<WorkerConfig, 'workerName' | 'mode'>,
  route: string,
  entry: Omit<WorkerLogEntry, 'worker' | 'mode' | 'route' | 'timestamp'>
): WorkerLogEntry {
  return {
    ...entry,
    worker: config.workerName,
    mode: config.mode,
    route,
    timestamp: new Date().toISOString(),
  }
}

function joinRouteUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): WorkerConfig {
  const explicitMode = parseModeFromArgv(argv)
  const mode = explicitMode ?? parseMode(env.DOOPIFY_WORKER_MODE)
  const baseUrl = normalizeBaseUrl(env.DOOPIFY_WORKER_BASE_URL || env.NEXT_PUBLIC_STORE_URL)
  const workerName = parseWorkerName(env.DOOPIFY_WORKER_NAME)
  const intervalMs = parseIntervalMs(env.DOOPIFY_WORKER_INTERVAL_MS)

  return {
    baseUrl,
    mode,
    intervalMs,
    workerName,
    secrets: {
      jobsRunner: env.JOB_RUNNER_SECRET || env.WEBHOOK_RETRY_SECRET || null,
      webhookRetry: env.WEBHOOK_RETRY_SECRET || null,
      abandonedCheckout: env.ABANDONED_CHECKOUT_SECRET || env.WEBHOOK_RETRY_SECRET || null,
    },
  }
}

export function buildRouteTargets(config: WorkerConfig): RouteTarget[] {
  const encodedWorkerName = encodeURIComponent(config.workerName)
  return [
    {
      route: 'jobs-run',
      path: `/api/jobs/run?runnerName=${encodedWorkerName}`,
      secret: config.secrets.jobsRunner,
    },
    {
      route: 'webhook-retries-run',
      path: '/api/webhook-retries/run',
      secret: config.secrets.webhookRetry,
    },
    {
      route: 'abandoned-checkouts-send-due',
      path: '/api/abandoned-checkouts/send-due',
      secret: config.secrets.abandonedCheckout,
    },
  ]
}

export function defaultWorkerLogger(entry: WorkerLogEntry) {
  const payload = JSON.stringify(entry)
  if (entry.level === 'error') {
    console.error('[worker]', payload)
    return
  }
  console.info('[worker]', payload)
}

async function runSingleRoute(input: {
  config: WorkerConfig
  target: RouteTarget
  fetchImpl: FetchLike
  logger: WorkerLogger
}): Promise<WorkerRouteResult> {
  const { config, target, fetchImpl, logger } = input
  const url = joinRouteUrl(config.baseUrl, target.path)
  const startedAt = Date.now()

  if (!target.secret) {
    const durationMs = Date.now() - startedAt
    logger(
      toWorkerLog(config, target.route, {
        level: 'error',
        message: 'Skipped route call because worker secret is missing',
        ok: false,
        durationMs,
      })
    )
    return {
      route: target.route,
      url,
      ok: false,
      statusCode: null,
      durationMs,
      error: 'Missing secret',
    }
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.secret}`,
        'x-doopify-worker-name': config.workerName,
      },
    })
    const durationMs = Date.now() - startedAt
    const ok = response.ok
    logger(
      toWorkerLog(config, target.route, {
        level: ok ? 'info' : 'error',
        message: ok ? 'Route call succeeded' : 'Route call failed',
        ok,
        statusCode: response.status,
        durationMs,
      })
    )
    return {
      route: target.route,
      url,
      ok,
      statusCode: response.status,
      durationMs,
      ...(ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : 'Network error'
    logger(
      toWorkerLog(config, target.route, {
        level: 'error',
        message: 'Route call threw error',
        ok: false,
        durationMs,
      })
    )
    return {
      route: target.route,
      url,
      ok: false,
      statusCode: null,
      durationMs,
      error: message,
    }
  }
}

export async function runWorkerPass(
  config: WorkerConfig,
  input: {
    fetchImpl?: FetchLike
    logger?: WorkerLogger
  } = {}
): Promise<WorkerPassResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const logger = input.logger ?? defaultWorkerLogger
  const targets = buildRouteTargets(config)
  const startedAt = new Date().toISOString()
  const results: WorkerRouteResult[] = []

  for (const target of targets) {
    // Sequential calls keep logs easier to reason about and still satisfy "continue on failure".
    results.push(
      await runSingleRoute({
        config,
        target,
        fetchImpl,
        logger,
      })
    )
  }

  return {
    worker: config.workerName,
    mode: config.mode,
    startedAt,
    completedAt: new Date().toISOString(),
    results,
  }
}


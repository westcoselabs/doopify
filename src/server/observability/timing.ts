type RouteTimingMeta = {
  statusCode?: number
}

type RouteTimerContext = {
  step: (name: string) => void
}

type StepSnapshot = {
  name: string
  durationMs: number
}

function parseBooleanFlag(value: string | undefined) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) return false
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isRouteTimingEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (!parseBooleanFlag(env.DOOPIFY_ROUTE_TIMING)) return false
  const nodeEnv = String(env.NODE_ENV || '').toLowerCase()
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase()
  const appEnv = String(env.APP_ENV || '').toLowerCase()
  const environment = String(env.DOOPIFY_ENV || '').toLowerCase()
  const isProductionLike =
    nodeEnv === 'production' && (vercelEnv === 'production' || appEnv === 'production' || environment === 'production')
  return !isProductionLike
}

function extractRequestId(req?: Request) {
  if (!req) return null
  return (
    req.headers.get('x-request-id') ||
    req.headers.get('x-vercel-id') ||
    req.headers.get('cf-ray') ||
    null
  )
}

function createRouteTimer(routeName: string, req?: Request) {
  const enabled = isRouteTimingEnabled()
  const requestId = extractRequestId(req)
  const startedAt = Date.now()
  let lastStepAt = startedAt
  const steps: StepSnapshot[] = []
  let finished = false

  return {
    step(name: string) {
      if (!enabled || finished) return
      const now = Date.now()
      steps.push({ name, durationMs: now - lastStepAt })
      lastStepAt = now
    },
    finish(meta: RouteTimingMeta = {}) {
      if (!enabled || finished) return
      finished = true
      const totalDurationMs = Date.now() - startedAt
      const logPayload = {
        route: routeName,
        totalDurationMs,
        statusCode: meta.statusCode ?? null,
        requestId,
        steps,
      }
      console.info('[route-timing]', JSON.stringify(logPayload))
    },
  }
}

export async function withRouteTiming<T extends Response>(
  routeName: string,
  req: Request | undefined,
  handler: (context: RouteTimerContext) => Promise<T>
) {
  const timer = createRouteTimer(routeName, req)
  let response: T | null = null
  try {
    response = await handler({
      step: (name: string) => timer.step(name),
    })
    return response
  } finally {
    timer.finish({
      statusCode: response?.status,
    })
  }
}

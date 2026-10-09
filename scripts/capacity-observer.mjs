// Benchmark-only preload. It is never imported by application code.
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Server } from 'node:http'
import pg from 'pg'

const traced = process.env.CAPACITY_TRACE === '1'
const buffer = []
let writing = false, dropped = 0
const path = `output/capacity-runtime-${process.pid}.ndjson`
function record(value) {
  if (buffer.length >= 20000) { dropped++; return }
  buffer.push(JSON.stringify({ ...value, pid: process.pid }))
}
async function flush() {
  if (writing || !buffer.length) return
  writing = true
  const text = buffer.splice(0).join('\n') + '\n'
  try { await appendFile(path, text) }
  catch { dropped += text.split('\n').length - 1 }
  finally { writing = false }
}

let tracer, api
// Pool callbacks may run in the releasing request's async context. The
// connection's borrower owns subsequent SQL, including after queue handoff.
const connectionContexts = new WeakMap()
let profileStarted = false
async function captureCpuProfile() {
  const { Session } = await import('node:inspector')
  const { writeFile } = await import('node:fs/promises')
  const session = new Session()
  session.connect()
  const post = method => new Promise((resolve, reject) => session.post(method, (error, value) => error ? reject(error) : resolve(value)))
  try {
    await post('Profiler.enable')
    await post('Profiler.start')
    await new Promise(resolve => setTimeout(resolve, 15000))
    const { profile } = await post('Profiler.stop')
    await writeFile(`output/capacity-cpu-${process.pid}.cpuprofile`, JSON.stringify(profile))
  } finally { session.disconnect() }
}
if (traced) {
  api = await import('@opentelemetry/api')
  const { TracerProvider, ParentBasedSampler, TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace')
  const { AsyncLocalStorageContextManager } = await import('@opentelemetry/context-async-hooks')
  const milliseconds = value => value[0] * 1000 + value[1] / 1e6
  const allowed = ['next.span_type', 'next.route', 'next.page', 'benchmark.id', 'benchmark.route', 'benchmark.status', 'db.fingerprint', 'db.category']
  const provider = new TracerProvider({ sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) }), spanProcessors: [{
    onStart() {},
    onEnd(span) {
      const attrs = Object.fromEntries(allowed.filter(key => span.attributes[key] !== undefined).map(key => [key, span.attributes[key]]))
      record({ kind: 'span', name: span.name.startsWith('benchmark.') ? span.name : String(attrs['next.span_type'] || 'next.internal'), traceId: span.spanContext().traceId, spanId: span.spanContext().spanId, parentSpanId: span.parentSpanContext?.spanId, start: milliseconds(span.startTime), end: milliseconds(span.endTime), attributes: attrs })
    },
    async shutdown() { await flush() }, async forceFlush() { await flush() },
  }] })
  api.context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  api.trace.setGlobalTracerProvider(provider)
  tracer = api.trace.getTracer('doopify-local-capacity')
  const emit = Server.prototype.emit
  Server.prototype.emit = function (event, ...args) {
    if (event !== 'request') return emit.call(this, event, ...args)
    const [request, response] = args
    const id = request.headers['x-benchmark-id']
    if (typeof id !== 'string' || !/^capacity-\d+-(?:warmup|measured|\d+-worker)-\d+$/.test(id)) return emit.call(this, event, ...args)
    if (!profileStarted && process.env.CAPACITY_CPU_PROFILE === '1' && id.includes('-measured-')) {
      profileStarted = true
      void captureCpuProfile().catch(error => record({ kind: 'profile-error', error: error.name }))
    }
    const pathname = String(request.url).split('?')[0]
    // Keep-alive socket callbacks can inherit an older request's context.
    return tracer.startActiveSpan('benchmark.request', { attributes: { 'benchmark.id': id, 'benchmark.route': pathname } }, api.ROOT_CONTEXT, span => {
      let ended = false
      const finish = () => { if (!ended) { ended = true; span.setAttribute('benchmark.status', response.statusCode); span.end() } }
      response.once('finish', finish)
      response.once('close', finish)
      return emit.call(this, event, ...args)
    })
  }
  const query = pg.Client.prototype.query
  const fingerprints = new Map()
  pg.Client.prototype.query = function (...args) {
    const context = connectionContexts.get(this) || api.context.active()
    if (!api.trace.getSpan(context)?.isRecording()) return query.apply(this, args)
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text || ''
    let fingerprint = fingerprints.get(text)
    if (!fingerprint) {
      fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 16)
      if (fingerprints.size < 500) fingerprints.set(text, fingerprint)
    }
    const category = /"sessions"|"users"/.test(text) ? 'auth' : /"jobs"|"event_dispatch_receipts"/.test(text) ? 'worker' : 'commerce-read'
    const span = tracer.startSpan('benchmark.sql', { attributes: { 'db.fingerprint': fingerprint, 'db.category': category } }, context)
    const callbackIndex = args.findIndex(value => typeof value === 'function')
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex]
      args[callbackIndex] = (...values) => { span.end(); return callback(...values) }
    }
    try {
      const result = query.apply(this, args)
      return callbackIndex < 0 && result?.finally ? result.finally(() => span.end()) : result
    } catch (error) { span.end(); throw error }
  }
}

const delay = monitorEventLoopDelay({ resolution: 20 })
delay.enable()
const pools = new Set()
const connect = pg.Pool.prototype.connect
pg.Pool.prototype.connect = function (...args) {
  pools.add(this)
  if (!traced) return connect.apply(this, args)
  const parentContext = api.context.active()
  const recording = api.trace.getSpan(parentContext)?.isRecording()
  const span = recording ? tracer.startSpan('benchmark.acquire', {}, parentContext) : null
  const acquired = client => {
    if (!client) return
    connectionContexts.set(client, parentContext)
    const hold = recording ? tracer.startSpan('benchmark.connection', {}, parentContext) : null
    const release = client.release
    client.release = function (...values) { hold?.end(); connectionContexts.delete(client); return release.apply(this, values) }
  }
  const callbackIndex = args.findIndex(value => typeof value === 'function')
  if (callbackIndex >= 0) {
    const callback = args[callbackIndex]
    args[callbackIndex] = (...values) => { span?.end(); acquired(values[1]); if (values[1]) values[2] = values[1].release; return callback(...values) }
  }
  try {
    const result = connect.apply(this, args)
    return callbackIndex < 0 && result?.then ? result.then(client => { span?.end(); acquired(client); return client }, error => { span?.end(); throw error }) : result
  } catch (error) { span?.end(); throw error }
}
let previousCpu = process.cpuUsage(), previousAt = performance.now()
setInterval(() => {
  const now = performance.now(), cpu = process.cpuUsage(previousCpu)
  previousCpu = process.cpuUsage()
  const memory = process.memoryUsage()
  record({ kind: 'runtime', at: Date.now(), rss: memory.rss, heapUsed: memory.heapUsed, traced,
    eventLoopP99Ms: delay.percentile(99) / 1e6, cpuMicroseconds: cpu.user + cpu.system, intervalMs: now - previousAt,
    droppedTraceRecords: dropped, pools: [...pools].filter(pool => !pool.ended).map(pool => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount })),
  })
  previousAt = now
  delay.reset()
  void flush()
}, 1000).unref()

// Open-loop generator restricted to the isolated synthetic fixture; never production.
import { performance } from 'node:perf_hooks'
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { routes, requestTarget, summarizeRequests } from './capacity-metrics.mjs'

const origins = ['http://127.0.0.1:3107', 'http://127.0.0.1:3108']
const rate = Number(process.env.CAPACITY_RPS || 100)
const seconds = Number(process.env.CAPACITY_SECONDS || 60)
const warmupSeconds = Number(process.env.CAPACITY_WARMUP_SECONDS || 30)
if (![100, 500].includes(rate) || !Number.isInteger(seconds) || seconds < 10 || seconds > 3600 || !Number.isInteger(warmupSeconds) || warmupSeconds < 0 || warmupSeconds > 120) throw new Error('Invalid benchmark rate/duration.')
const client = new pg.Client({ connectionString: 'postgresql://doopify_test@127.0.0.1:55432/doopify_test', options: '-c search_path=commerce_perf' })
const runId = `capacity-${Date.now()}`
const database = [], workerResults = []
let cookie, workerBusy = false, workerFailures = 0, produced = 0, phase = 'startup'

async function workerPass() {
  if (workerBusy) return
  workerBusy = true
  const currentPhase = phase
  try {
    const id = `${runId}-${produced++}`
    await client.query('INSERT INTO jobs (id, type, payload, "deduplicationKey", "updatedAt") VALUES ($1, $2, $3, $1, now())', [id, 'DISPATCH_INTERNAL_EVENT', JSON.stringify({ eventId: id, event: 'order.created', payload: { orderId: 'perf-order-00001', orderNumber: 1, total: 1599, currency: 'USD' } })])
    await Promise.all(origins.map(async (origin, replica) => {
      const response = await fetch(`${origin}/api/jobs/run?limit=25`, { method: 'POST', headers: { Authorization: 'Bearer local-capacity-jobs-only', 'x-benchmark-id': `${id}-worker-${replica}` }, signal: AbortSignal.timeout(15000) })
      const result = await response.json()
      const failed = !response.ok || result.success !== true || !Number.isFinite(result.data?.failed) || result.data.failed > 0
      if (failed) workerFailures++
      workerResults.push({ at: Date.now(), phase: currentPhase, replica, status: response.status, failed, processed: result.data?.processed, succeeded: result.data?.succeeded })
    }))
    const result = await client.query('SELECT count(*)::int AS pending, extract(epoch FROM (now()-min("createdAt")))::float AS "oldestSeconds" FROM jobs WHERE status IN (\'PENDING\',\'RETRYING\',\'RUNNING\')')
    const connections = await client.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()')
    database.push({ at: Date.now(), phase: currentPhase, ...result.rows[0], connections: connections.rows[0].count })
  } catch (error) {
    workerFailures++
    workerResults.push({ at: Date.now(), phase: currentPhase, failed: true, error: error.name })
  } finally { workerBusy = false }
}

async function runPhase(name, duration) {
  phase = name
  const startedAt = Date.now(), started = performance.now()
  const outstanding = new Set(), requests = []
  let offered = 0, dropped = 0
  async function request(index) {
    const { route, replica } = requestTarget(index)
    const scheduledAt = started + index * 1000 / rate
    const dispatchedAt = performance.now()
    const record = { id: `${runId}-${name}-${index}`, phase: name, route, replica, window: Math.floor(index / rate / 5), schedulingMs: dispatchedAt - scheduledAt, status: null, failed: false, headersMs: null, bodyMs: null, bytes: 0 }
    try {
      const response = await fetch(origins[replica] + route, { headers: { cookie, 'x-benchmark-id': record.id }, signal: AbortSignal.timeout(10000), redirect: 'error' })
      const headersAt = performance.now()
      record.headersMs = headersAt - dispatchedAt
      record.status = response.status
      record.bytes = (await response.arrayBuffer()).byteLength
      record.bodyMs = performance.now() - headersAt
      record.failed = !response.ok
    } catch (error) { record.failed = true; record.error = error.name }
    finally { record.totalMs = performance.now() - scheduledAt; requests.push(record) }
  }
  while (offered < rate * duration) {
    const due = Math.min(rate * duration, Math.floor((performance.now() - started) * rate / 1000))
    while (offered < due) {
      const index = offered++
      if (outstanding.size >= 500) { dropped++; continue }
      const promise = request(index).finally(() => outstanding.delete(promise))
      outstanding.add(promise)
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  await Promise.allSettled(outstanding)
  const elapsedSeconds = (performance.now() - started) / 1000
  return { startedAt, endedAt: Date.now(), seconds: duration, offered, completed: requests.length, dropped, elapsedSeconds, achievedRps: requests.length / elapsedSeconds, ...summarizeRequests(requests), requests }
}

let workers
await client.connect()
try {
  const login = await fetch(`${origins[0]}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'performance-owner@example.test', password: 'Doopify-Test-Only-2026!' }), signal: AbortSignal.timeout(10000) })
  cookie = login.headers.get('set-cookie')?.match(/doopify_token=[^;]+/)?.[0]
  await login.arrayBuffer()
  if (!login.ok || !cookie) throw new Error(`Synthetic fixture login failed: ${login.status}`)
  for (const origin of origins) for (const route of new Set(routes)) {
    const response = await fetch(origin + route, { headers: { cookie }, signal: AbortSignal.timeout(10000) })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Priming failed: ${route} ${response.status}`)
  }
  workers = setInterval(workerPass, 5000)
  const warmup = await runPhase('warmup', warmupSeconds)
  const measured = await runPhase('measured', seconds)
  clearInterval(workers)
  while (workerBusy) await new Promise(resolve => setTimeout(resolve, 100))
  phase = 'drain'
  await workerPass()
  const schedulerHealthy = measured.latency.schedulingMs.p99 < 50
  const passed = schedulerHealthy && measured.failures / measured.offered < .01 && measured.dropped === 0 && workerFailures === 0 && measured.latency.totalMs.p95 < 1000
  const report = { formatVersion: 2, runId, label: process.env.CAPACITY_LABEL || 'unlabelled', buildId: readFileSync('.next/BUILD_ID', 'utf8').trim(), rate, replicas: 2, poolMaxPerReplica: 10, traced: process.env.CAPACITY_TRACE === '1', traceSampleRate: process.env.CAPACITY_TRACE === '1' ? .1 : 0, cpuProfile: process.env.CAPACITY_CPU_PROFILE === '1', schedulerHealthy, passed, workerFailures, workerResults, database, warmup, measured }
  writeFileSync(`output/${runId}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ file: `output/${runId}.json`, label: report.label, passed, schedulerHealthy, workerFailures, offered: measured.offered, completed: measured.completed, dropped: measured.dropped, failures: measured.failures, latency: measured.latency, routes: measured.byRoute }))
  process.exitCode = passed ? 0 : 1
} finally {
  clearInterval(workers)
  while (workerBusy) await new Promise(resolve => setTimeout(resolve, 100))
  await client.end()
}

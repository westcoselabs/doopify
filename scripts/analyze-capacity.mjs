import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { intervalUnionMs, percentiles } from './capacity-metrics.mjs'

const file = process.argv[2]
if (!/^output[\\/]capacity-\d+\.json$/.test(file || '')) throw new Error('Supply a local output/capacity-<timestamp>.json report.')
const report = JSON.parse(readFileSync(file, 'utf8'))
const spans = [], runtime = []
for (const filename of readdirSync('output').filter(name => /^capacity-runtime-\d+\.ndjson$/.test(name))) {
  for (const line of readFileSync(`output/${filename}`, 'utf8').trim().split('\n')) {
    if (!line) continue
    const row = JSON.parse(line)
    if (row.kind === 'span' && row.start >= report.measured.startedAt && row.start <= report.measured.endedAt) spans.push(row)
    if (row.kind === 'runtime' && row.at >= report.measured.startedAt && row.at <= report.measured.endedAt) runtime.push(row)
  }
}
const traces = Map.groupBy(spans, row => row.traceId)
const roots = new Map(spans.filter(span => span.name === 'benchmark.request').map(span => [span.attributes['benchmark.id'], span]))
if (new Set([...roots.values()].map(span => span.traceId)).size !== roots.size) throw new Error('Requests share a trace: correlation is invalid.')
const requestRows = []
const fingerprints = new Map()
for (const request of report.measured.requests) {
  const root = roots.get(request.id)
  if (!root) continue
  const related = traces.get(root.traceId) || []
  const sql = related.filter(span => span.name === 'benchmark.sql')
  const acquire = related.filter(span => span.name === 'benchmark.acquire')
  const connections = related.filter(span => span.name === 'benchmark.connection')
  const render = related.filter(span => span.attributes['next.span_type'] === 'AppRender.getBodyResult')
  const middleware = related.filter(span => /Middleware/.test(span.attributes['next.span_type'] || ''))
  const interval = span => [Math.max(root.start, span.start), Math.min(root.end, span.end)]
  const union = selected => intervalUnionMs(selected.map(interval).filter(([a, b]) => b > a))
  const duration = span => Math.max(0, span.end - span.start)
  for (const span of sql) {
    const key = span.attributes['db.fingerprint']
    if (!fingerprints.has(key)) fingerprints.set(key, [])
    fingerprints.get(key).push(duration(span))
  }
  requestRows.push({ id: request.id, route: request.route, replica: request.replica, totalMs: request.totalMs, serverMs: duration(root), sqlCount: sql.length, sqlSumMs: sql.reduce((sum, span) => sum + duration(span), 0), sqlUnionMs: union(sql), acquisitionUnionMs: union(acquire), connectionUnionMs: union(connections), databaseUnionMs: union([...sql, ...acquire]), authSqlUnionMs: union(sql.filter(span => span.attributes['db.category'] === 'auth')), middlewareUnionMs: union(middleware), renderUnionMs: union(render), nonDatabaseServerMs: Math.max(0, duration(root) - union([...sql, ...acquire])), nextSpanCount: related.filter(span => span.attributes['next.span_type']).length })
}
const summarize = rows => ({ requests: rows.length, ...Object.fromEntries(['totalMs', 'serverMs', 'sqlCount', 'sqlSumMs', 'sqlUnionMs', 'acquisitionUnionMs', 'connectionUnionMs', 'databaseUnionMs', 'authSqlUnionMs', 'middlewareUnionMs', 'renderUnionMs', 'nonDatabaseServerMs', 'nextSpanCount'].map(key => [key, percentiles(rows.map(row => row[key]))])) })
const output = {
  runId: report.runId, label: report.label, traced: report.traced,
  measuredRequests: report.measured.completed, tracedRequests: requestRows.length,
  timingNote: 'SQL spans include pg/network/decoding time. Acquisitions include new connections and event-loop delay. Render spans overlap DB spans. nonDatabaseServerMs is a residual, not pure CPU. Percentiles from different request populations must not be added.',
  overall: summarize(requestRows),
  slowestFivePercent: summarize([...requestRows].sort((a, b) => b.totalMs - a.totalMs).slice(0, Math.ceil(requestRows.length * .05))),
  byRoute: Object.fromEntries([...Map.groupBy(requestRows, row => row.route)].map(([route, rows]) => [route, summarize(rows)])),
  byWindow: Object.fromEntries([...Map.groupBy(report.measured.requests, row => row.window)].map(([window, rows]) => [window, { totalMs: percentiles(rows.map(row => row.totalMs)), schedulingMs: percentiles(rows.map(row => row.schedulingMs)) }])),
  queries: [...fingerprints].map(([fingerprint, durations]) => ({ fingerprint, count: durations.length, durationMs: percentiles(durations), sumMs: durations.reduce((a, b) => a + b, 0) })).sort((a, b) => b.sumMs - a.sumMs),
  runtime: Object.fromEntries([...Map.groupBy(runtime, row => row.pid)].map(([pid, rows]) => [pid, {
    samples: rows.length, rssMiB: percentiles(rows.map(row => row.rss / 1048576)), heapMiB: percentiles(rows.map(row => row.heapUsed / 1048576)),
    eventLoopP99Ms: percentiles(rows.map(row => row.eventLoopP99Ms)), cpuCorePercent: percentiles(rows.map(row => row.cpuMicroseconds / (row.intervalMs * 10))),
    poolCountMax: Math.max(...rows.map(row => row.pools.length)), poolConnectionsMax: Math.max(...rows.map(row => row.pools.reduce((sum, pool) => sum + pool.total, 0))), poolWaitMax: Math.max(...rows.map(row => row.pools.reduce((sum, pool) => sum + pool.waiting, 0))), droppedTraceRecords: Math.max(...rows.map(row => row.droppedTraceRecords)),
  }])),
}
writeFileSync(file.replace('.json', '-analysis.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify({ runId: output.runId, label: output.label, tracedRequests: output.tracedRequests, overall: output.overall, runtime: output.runtime }))

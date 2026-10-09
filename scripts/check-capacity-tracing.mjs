// Verify attribution under a queued pg connection handoff, using only SELECTs
// against the same disposable loopback database as the capacity harness.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

assert.equal(process.env.CAPACITY_TRACE, '1', 'Run with CAPACITY_TRACE=1 and --import ./scripts/capacity-observer.mjs')
const pool = new pg.Pool({ connectionString: 'postgresql://doopify_test@127.0.0.1:55432/doopify_test', max: 1 })
const runId = `capacity-${Date.now()}`
const server = createServer(async (_request, response) => {
  try {
    const client = await pool.connect()
    try { await client.query('SELECT pg_sleep(0.002)') }
    finally { client.release() }
    response.end('ok')
  } catch { response.statusCode = 500; response.end('failed') }
})
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await Promise.all(Array.from({ length: 200 }, async (_, index) => {
    const response = await fetch(`http://127.0.0.1:${port}`, { headers: { 'x-benchmark-id': `${runId}-measured-${index}` }, signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 200)
    await response.text()
  }))
  // The benchmark exporter deliberately buffers instead of blocking requests.
  await new Promise(resolve => setTimeout(resolve, 1500))
  const rows = (await readFile(`output/capacity-runtime-${process.pid}.ndjson`, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  const roots = rows.filter(row => row.name === 'benchmark.request' && row.attributes['benchmark.id'].startsWith(runId))
  assert.ok(roots.length > 0, 'The 10% sampler must capture requests')
  assert.equal(new Set(roots.map(row => row.traceId)).size, roots.length)
  for (const root of roots) {
    const spans = rows.filter(row => row.traceId === root.traceId)
    const sql = spans.filter(row => row.name === 'benchmark.sql')
    const hold = spans.filter(row => row.name === 'benchmark.connection')
    assert.equal(sql.length, 1, 'Each sampled borrower must own exactly its query')
    assert.equal(hold.length, 1)
    // SDK start times use millisecond wall-clock precision; independently
    // timed spans can disagree by less than one millisecond at their edges.
    assert.ok(sql[0].start >= hold[0].start - 1 && sql[0].end <= hold[0].end + 1)
  }
  console.log(JSON.stringify({ sampledRequests: roots.length, uniqueRoots: true, queuedSqlOwnership: true }))
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await pool.end()
}

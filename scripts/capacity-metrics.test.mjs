import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestTarget, intervalUnionMs, summarizeRequests } from './capacity-metrics.mjs'

test('the actual 6000-request mix balances every route across replicas', () => {
  const counts = new Map()
  for (let index = 0; index < 6000; index++) {
    const { route, replica } = requestTarget(index)
    const pair = counts.get(route) || [0, 0]
    pair[replica]++; counts.set(route, pair)
  }
  for (const pair of counts.values()) assert.equal(pair[0], pair[1])
  assert.deepEqual(counts.get('/shop'), [1800, 1800])
  assert.deepEqual(counts.get('/admin/settings/shipping'), [300, 300])
})
test('overlap accounting does not double-count concurrent or nested SQL', () => {
  assert.equal(intervalUnionMs([[5, 12], [0, 10], [2, 4], [20, 25]]), 17)
})
test('failures remain in total latency and missing headers are not zeros', () => {
  const result = summarizeRequests([{ failed: true, route: '/shop', replica: 0, window: 1, totalMs: 10000, headersMs: null, bodyMs: null, schedulingMs: 2, bytes: 0 }])
  assert.equal(result.failures, 1)
  assert.equal(result.latency.totalMs.p95, 10000)
  assert.equal(result.latency.headersMs.samples, 0)
})

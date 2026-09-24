import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const label = process.argv[2] ?? 'baseline'
if (!['baseline', 'after'].includes(label)) throw new Error('Expected baseline or after')
const origin = 'http://127.0.0.1:3107'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const login = await context.request.post(`${origin}/api/auth/login`, { data: { email: 'performance-owner@example.test', password: 'Doopify-Test-Only-2026!' } })
if (!login.ok()) throw new Error(`Fixture login failed: ${login.status()}`)
// Chromium permits secure localhost cookies; normalize this synthetic session for
// the explicit loopback HTTP benchmark rather than weakening application cookies.
const token = login.headers()['set-cookie']?.match(/doopify_token=([^;]+)/)?.[1]
if (!token) throw new Error('Fixture login returned no session')
await context.addCookies([{ name: 'doopify_token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Strict' }])
const routes = label === 'baseline'
  ? ['/settings', '/shop', '/collections/performance-collection-0', '/checkout']
  : ['/admin/settings/general', '/shop', '/collections/performance-collection-0', '/checkout']
const results = []
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
for (const route of routes) {
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Performance.enable')
  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  const requests = []
  const errors = []
  page.on('request', (request) => requests.push({ url: request.url().replace(origin, ''), type: request.resourceType() }))
  page.on('pageerror', (error) => errors.push(error.message))
  const startedAt = Date.now()
  const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle', timeout: 120000 })
  const finishedAt = Date.now()
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, transfer: entry.transferSize, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize, type: entry.initiatorType })))
  const metrics = (await client.send('Performance.getMetrics')).metrics
  const queries = readFileSync('.next/performance-queries.ndjson', 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((query) => query.at >= startedAt && query.at <= finishedAt)
  const latencies = []
  const payloadBytes = []
  for (let index = 0; index < 30; index++) {
    const start = performance.now()
    const res = await context.request.get(`${origin}${route}`)
    payloadBytes.push((await res.body()).length)
    latencies.push(performance.now() - start)
  }
  results.push({ route, status: response.status(), finalUrl: page.url(), requests, errors, navigationMs: finishedAt - startedAt, scriptEncodedBytes: resources.filter((entry) => entry.type === 'script').reduce((sum, entry) => sum + entry.encoded, 0), transferBytes: resources.reduce((sum, entry) => sum + entry.transfer, 0), sql: { count: queries.length, durationMs: queries.reduce((sum, query) => sum + query.ms, 0) }, scriptingSeconds: metrics.find((entry) => entry.name === 'ScriptDuration')?.value, samples: latencies.length, p50Ms: percentile(latencies, .5), p95Ms: percentile(latencies, .95), htmlBytes: percentile(payloadBytes, .5) })
  await page.screenshot({ path: `.next/performance-${label}-${results.length}.png`, fullPage: false })
  console.log(JSON.stringify(results.at(-1)))
  await page.close()
}
writeFileSync(`docs/performance/env-only-${label}-runtime.json`, JSON.stringify({ label, measuredAt: new Date().toISOString(), node: process.version, note: 'Synthetic local warm server, cold browser cache, one browser navigation per route; HTTP latencies are 30 sequential warm requests. SQL includes all queries during the initial navigation. Checkout is empty-cart navigation; promotion checkout timing is measured separately.', results }, null, 2) + '\n')
await browser.close()

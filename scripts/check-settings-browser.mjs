// Production-build smoke checks against the isolated performance fixture only.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const origin = 'http://127.0.0.1:3107'
const browser = await chromium.launch()
try {
  // Differ from the server timezone to catch date hydration mismatches.
  const context = await browser.newContext({ timezoneId: 'Pacific/Auckland' })
  const denied = await context.request.get(`${origin}/api/system/integrations`)
  assert.equal(denied.status(), 401)
  const login = await context.request.post(`${origin}/api/auth/login`, { data: { email: 'performance-owner@example.test', password: 'Doopify-Test-Only-2026!' } })
  assert.equal(login.status(), 200)
  const token = login.headers()['set-cookie']?.match(/doopify_token=([^;]+)/)?.[1]
  assert.ok(token)
  await context.addCookies([{ name: 'doopify_token', value: token, domain: '127.0.0.1', path: '/', secure: false, httpOnly: true, sameSite: 'Strict' }])
  const results = []
  for (const route of ['general', 'brand', 'shipping', 'taxes', 'email', 'account', 'team', '../system/developer']) {
    const url = new URL(`/admin/settings/${route}`, origin).href
    const page = await context.newPage()
    const errors = [], requests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(new URL(request.url()).pathname) })
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    assert.equal(response.status(), 200, route)
    assert.deepEqual(errors, [], route)
    assert.ok(!requests.some((path) => /\/providers\/|\/integrations\/.*\/test|\/setup\/|\/deployment-validation/.test(path)), `Automatic diagnostic in ${route}`)
    const automaticRequests = [...requests]
    if (route === 'general') {
      assert.ok(!requests.includes('/api/settings'), 'General must receive settings from its Server Component')
      const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'General', exact: true }) })
      const input = form.locator('input').first()
      await input.fill('Unsaved browser regression fixture')
      await page.route('**/api/settings', async (request) => {
        assert.equal(request.request().method(), 'PATCH')
        await request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Settings save unavailable' }) })
      })
      await form.getByRole('button', { name: 'Save settings', exact: true }).click()
      await form.getByRole('alert').waitFor()
      assert.equal(await input.inputValue(), 'Unsaved browser regression fixture')
      assert.equal(await form.getByText('Store settings saved.').count(), 0)
    }
    results.push({ route: new URL(url).pathname, status: response.status(), automaticRequests, browserErrors: errors })
    await page.close()
  }
  const redirect = await context.request.get(`${origin}/settings?section=payments`, { maxRedirects: 0 })
  assert.ok([307, 308].includes(redirect.status()))
  assert.ok(redirect.headers().location?.endsWith('/admin/system/developer'))
  const report = { measuredAt: new Date().toISOString(), productionBuild: true, browserTimeZone: 'Pacific/Auckland', anonymousStatusDenied: true, legacyBookmarkRedirect: true, generalSaveFailurePreservesDraft: true, results }
  writeFileSync('docs/performance/env-only-settings-browser.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ routesPassed: results.length, anonymousStatusDenied: true, legacyBookmarkRedirect: true, generalSaveFailurePreservesDraft: true }))
} finally {
  await browser.close()
}

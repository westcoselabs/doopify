// Production-build smoke checks against the isolated performance fixture only.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
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
  for (const route of ['general', 'brand', 'shipping', 'taxes', 'email', '../account', '../system/team', '../system/developer']) {
    const url = new URL(`/admin/settings/${route}`, origin).href
    const page = await context.newPage()
    const errors = [], requests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push(new URL(request.url()).pathname) })
    const startedAt = Date.now()
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    const finishedAt = Date.now()
    const queries = readFileSync('.next/performance-queries.ndjson', 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(query => query.at >= startedAt && query.at <= finishedAt)
    assert.equal(response.status(), 200, route)
    assert.deepEqual(errors, [], route)
    assert.ok(!requests.some((path) => /\/providers\/|\/integrations\/.*\/test|\/setup\/|\/deployment-validation/.test(path)), `Automatic diagnostic in ${route}`)
    const automaticRequests = [...requests]
    const storeNav = page.getByRole('navigation', { name: 'Store settings', exact: true })
    if (!route.startsWith('../')) {
      assert.equal(await storeNav.getByRole('link').count(), 5)
      assert.equal(await storeNav.getByText(/Developer|Team|My account/).count(), 0)
      assert.ok(!requests.some((path) => path.startsWith('/api/settings/')), `Initial settings waterfall in ${route}`)
    } else {
      assert.equal(await storeNav.count(), 0, 'System/account pages must not sit inside merchant Settings')
    }
    if (['shipping', 'email', '../system/developer'].includes(route)) {
      await page.setViewportSize({ width: 1440, height: 1100 })
      await page.screenshot({ path: `output/settings-${route.split('/').at(-1)}-desktop.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
      assert.equal(await page.getByRole('navigation', { name: 'Admin navigation', exact: true }).isVisible(), true)
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
      assert.equal(await page.getByRole('navigation', { name: 'Admin navigation', exact: true }).isVisible(), false)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow in ${route}`)
      await page.screenshot({ path: `output/settings-${route.split('/').at(-1)}-mobile.png`, fullPage: true })
      await page.setViewportSize({ width: 1440, height: 1100 })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForFunction(() => document.documentElement.dataset.dashboardTheme === 'dark')
      await page.screenshot({ path: `output/settings-${route.split('/').at(-1)}-dark.png`, fullPage: true, animations: 'disabled' })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.waitForFunction(() => document.documentElement.dataset.dashboardTheme === 'light')
    }
    if (route === 'shipping') {
      await page.getByRole('button', { name: 'Add location', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await drawer.getByLabel('Location name', { exact: true }).fill('Unsaved shipping location')
      await page.route('**/api/settings/shipping/locations', request => request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Location save unavailable' }) }))
      await drawer.getByRole('button', { name: 'Save location', exact: true }).click()
      await drawer.getByText('Location save unavailable').waitFor()
      assert.equal(await drawer.getByLabel('Location name', { exact: true }).inputValue(), 'Unsaved shipping location')
      assert.equal(await drawer.count(), 1)
    }
    if (route === 'email') {
      assert.equal(await page.getByRole('button', { name: 'Save sender', exact: true }).count(), 0)
      await page.locator('summary').filter({ hasText: 'Order confirmation' }).click()
      const subject = page.getByLabel('Subject', { exact: true }).first()
      await subject.fill('Unsaved customer message')
      await page.route('**/api/email-templates/order_confirmation', request => request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Template save unavailable' }) }))
      await page.getByRole('button', { name: 'Save template', exact: true }).first().click()
      await page.getByRole('alert').waitFor()
      assert.equal(await subject.inputValue(), 'Unsaved customer message')
    }
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
    results.push({ route: new URL(url).pathname, status: response.status(), initialPrismaQueries: queries.length, automaticRequests, browserErrors: errors })
    await page.close()
  }
  const redirect = await context.request.get(`${origin}/settings?section=payments`, { maxRedirects: 0 })
  assert.ok([307, 308].includes(redirect.status()))
  assert.ok(redirect.headers().location?.endsWith('/admin/system/developer'))
  for (const [old, current] of [['account', '/admin/account'], ['team', '/admin/system/team']]) {
    const redirected = await context.request.get(`${origin}/admin/settings/${old}`)
    assert.equal(new URL(redirected.url()).pathname, current)
  }
  const report = { measuredAt: new Date().toISOString(), productionBuild: true, browserTimeZone: 'Pacific/Auckland', anonymousStatusDenied: true, legacyBookmarkRedirect: true, generalSaveFailurePreservesDraft: true, shippingLocationFailurePreservesDraft: true, emailTemplateFailurePreservesDraft: true, fiveMerchantSections: true, responsiveWidths: [1440,390], results }
  writeFileSync('docs/performance/settings-refinement-browser.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ routesPassed: results.length, anonymousStatusDenied: true, legacyBookmarkRedirect: true, generalSaveFailurePreservesDraft: true }))
} finally {
  await browser.close()
}

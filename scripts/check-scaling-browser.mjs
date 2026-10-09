import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const origin = 'http://127.0.0.1:3107'
const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  const login = await context.request.post(`${origin}/api/auth/login`, { data: { email: 'performance-owner@example.test', password: 'Doopify-Test-Only-2026!' } })
  assert.equal(login.status(), 200)
  const token = login.headers()['set-cookie']?.match(/doopify_token=([^;]+)/)?.[1]
  assert.ok(token)
  await context.addCookies([{ name: 'doopify_token', value: token, domain: '127.0.0.1', path: '/', secure: false, httpOnly: true, sameSite: 'Strict' }])
  await context.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    window.previewUrls = new Set()
    URL.createObjectURL = value => { const url = create(value); window.previewUrls.add(url); return url }
    URL.revokeObjectURL = url => { window.previewUrls.delete(url); revoke(url) }
  })
  const page = await context.newPage()
  const errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())) requests.push({ method: request.method(), url: request.url() }) })
  page.on('dialog', dialog => dialog.accept())
  await page.goto(`${origin}/admin/settings/shipping`, { waitUntil: 'networkidle' })
  await page.getByRole('button').filter({ hasText: 'Live with fallback' }).click()
  await page.getByRole('button', { name: 'Add manual rate', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('Rate name', { exact: true }).fill('Browser scaling fixture')
  const select = drawer.getByRole('combobox', { name: 'Rate type', exact: true })
  await select.focus()
  await select.press('ArrowDown')
  assert.equal(await select.inputValue(), 'FREE')
  await drawer.getByLabel('Free shipping minimum (USD)', { exact: false }).fill('75')
  const saveRequest = page.waitForResponse(response => response.url().endsWith('/api/settings/shipping/manual-rates') && response.request().method() === 'POST')
  await drawer.getByRole('button', { name: 'Save manual rate', exact: true }).click()
  const saved = await (await saveRequest).json()
  assert.equal(saved.success, true)
  try {
    await page.getByText('Browser scaling fixture', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Save checkout method', exact: true }).isEnabled(), true)
    assert.equal(requests.filter(request => request.method === 'GET' && request.url.includes('/api/settings/shipping')).length, 0)
    // A local setting save must keep the separate checkout-method draft.
    await page.getByRole('button', { name: 'Edit instructions', exact: true }).click()
    await drawer.getByLabel('Default fulfillment instructions', { exact: true }).fill('Failure preserves this draft')
    await page.route('**/api/settings/shipping?view=workspace', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Validation failed', details: { fieldErrors: { manualFulfillmentInstructions: ['Fixture rejection'] } } }) }))
    await drawer.getByRole('button', { name: 'Save settings', exact: true }).click()
    await drawer.getByRole('alert').waitFor()
    assert.match(await drawer.getByRole('alert').textContent(), /Fixture rejection/)
    assert.equal(await drawer.getByRole('textbox', { name: 'Default fulfillment instructions', exact: true }).inputValue(), 'Failure preserves this draft')
  } finally {
    const removed = await context.request.delete(`${origin}/api/settings/shipping/manual-rates/${saved.data.id}`, { headers: { cookie: `doopify_token=${token}` } })
    assert.equal(removed.status(), 200)
  }

  await page.goto(`${origin}/products?new=1`, { waitUntil: 'networkidle' })
  await drawer.getByLabel('Title', { exact: true }).fill('Before upload')
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/media/upload', async route => {
    await gate
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'perf-media-00999', url: '/api/media/perf-media-00999', altText: 'Fixture image', linkedProducts: 0 } }) })
  })
  await drawer.getByRole('tab', { name: 'Media', exact: true }).click()
  const file = { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64') }
  await drawer.locator('input[type=file]').first().setInputFiles([file, { ...file, name: 'second.png' }])
  await page.waitForFunction(() => window.previewUrls.size === 2)
  await drawer.getByRole('tab', { name: 'Basic', exact: true }).click()
  await drawer.getByLabel('Title', { exact: true }).fill('Typed during upload')
  release()
  await page.waitForFunction(() => window.previewUrls.size === 0)
  assert.equal(await drawer.getByLabel('Title', { exact: true }).inputValue(), 'Typed during upload')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: 'output/scaling-product-editor.png' })
  console.log(JSON.stringify({ independentShippingDrafts: true, noSaveReload: true, nativeKeyboardSelect: true, structuredDrawerError: true, blobUrlsReleased: true, uploadPreservesConcurrentEdits: true, errors }))
} finally { await browser.close() }

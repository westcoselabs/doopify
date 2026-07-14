import { expect, test } from '@playwright/test'

test('checkout status polling sends the capability only in a POST body', async ({ page }) => {
  const paymentIntentId = 'pi_e2e_capability_status'
  const statusToken = 'e2e-status-capability-token-not-in-url'
  const observed: Array<{ method: string; url: string; body: Record<string, unknown> }> = []

  await page.addInitScript(
    ({ id, token }) => {
      window.sessionStorage.setItem(`doopify:checkout-status:${id}`, token)
    },
    { id: paymentIntentId, token: statusToken }
  )

  await page.route('**/api/checkout/status', async (route) => {
    observed.push({
      method: route.request().method(),
      url: route.request().url(),
      body: JSON.parse(route.request().postData() || '{}'),
    })
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          status: 'paid',
          orderNumber: 4242,
          total: 42,
          currency: 'USD',
          estimatedDeliveryText: 'Tomorrow',
          digitalDownloads: [],
          digitalDownloadsPending: false,
        },
      }),
    })
  })

  await page.goto(`/checkout/success?payment_intent=${paymentIntentId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Your payment was successful and your order has been received.')).toBeVisible()
  await expect(page.getByText('Order #4242')).toBeVisible()
  await expect.poll(() => observed.length).toBe(1)

  expect(observed).toEqual([
    {
      method: 'POST',
      url: expect.not.stringContaining(statusToken),
      body: { paymentIntentId, statusToken },
    },
  ])
  expect(page.url()).not.toContain(statusToken)
})

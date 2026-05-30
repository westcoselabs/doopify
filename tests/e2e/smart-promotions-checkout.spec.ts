import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

type MockCheckoutPayload = {
  clientSecret: string
  currency: string
  subtotal: number
  shippingAmount: number
  taxAmount: number
  total: number
  discountAmount: number
  discountAmountCents?: number
  codeDiscountAmount?: number
  codeDiscountAmountCents?: number
  promotionDiscountAmount?: number
  promotionDiscountAmountCents?: number
  discountApplications?: Array<{
    code?: string
    title?: string
    amount?: number
    amountCents?: number
  }>
  promotionApplications?: Array<{
    name?: string
    promotionName?: string
    amount?: number
    amountCents?: number
  }>
}

const CART_ITEMS = [
  {
    variantId: 'var_digital_demo',
    productId: 'prod_digital_demo',
    title: 'Digital Field Guide',
    variantTitle: 'Default',
    quantity: 1,
    price: 49,
    fulfillmentType: 'DIGITAL',
  },
]

function ensureScreenshotDir() {
  const screenshotDir = join(process.cwd(), 'test-result')
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true })
  }
  return screenshotDir
}

function screenshotPath(filename: string) {
  return join(ensureScreenshotDir(), filename)
}

function installStripeStub(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    ;(window as typeof window & { Stripe?: (key: string) => unknown }).Stripe = () => ({
      elements: () => ({
        create: () => ({
          mount: () => {},
          unmount: () => {},
        }),
        submit: async () => ({}),
      }),
      confirmPayment: async () => ({
        paymentIntent: {
          id: 'pi_phase8_mock',
        },
      }),
    })
  })
}

function seedCart(page: import('@playwright/test').Page) {
  return page.addInitScript((items) => {
    window.localStorage.setItem('doopify_cart', JSON.stringify(items))
  }, CART_ITEMS)
}

async function mockCheckoutCreate(
  page: import('@playwright/test').Page,
  payload: MockCheckoutPayload
) {
  await page.route('**/api/checkout/create', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: payload,
      }),
    })
  })
}

async function openCheckoutAndReviewPayment(page: import('@playwright/test').Page) {
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Finish the purchase flow.' })).toBeVisible()
  await page.locator('input[name="email"]').fill('promo-visibility@example.com')
  await page.getByRole('button', { name: 'Review payment' }).click()
}

test.describe('Smart Promotions checkout visibility screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('captures promotion summary in checkout totals', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    try {
      const page = await context.newPage()
      await seedCart(page)
      await installStripeStub(page)
      await mockCheckoutCreate(page, {
        clientSecret: 'cs_phase8_promotion_only',
        currency: 'USD',
        subtotal: 49,
        shippingAmount: 0,
        taxAmount: 0,
        total: 36.5,
        discountAmount: 12.5,
        discountAmountCents: 1250,
        promotionDiscountAmount: 12.5,
        promotionDiscountAmountCents: 1250,
        promotionApplications: [
          {
            name: 'Hoodie + Hat bundle savings',
            amount: 12.5,
            amountCents: 1250,
          },
        ],
      })

      await openCheckoutAndReviewPayment(page)
      await expect(page.getByText('Promotions applied')).toBeVisible()
      await expect(page.getByText('Hoodie + Hat bundle savings').first()).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-8-checkout-promotion-summary.png'),
        fullPage: true,
      })
    } finally {
      await context.close()
    }
  })

  test('captures checkout code-vs-promotion discount split', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    try {
      const page = await context.newPage()
      await seedCart(page)
      await installStripeStub(page)
      await mockCheckoutCreate(page, {
        clientSecret: 'cs_phase8_code_and_promotion',
        currency: 'USD',
        subtotal: 49,
        shippingAmount: 0,
        taxAmount: 0,
        total: 34,
        discountAmount: 15,
        discountAmountCents: 1500,
        codeDiscountAmount: 5,
        codeDiscountAmountCents: 500,
        promotionDiscountAmount: 10,
        promotionDiscountAmountCents: 1000,
        discountApplications: [
          {
            code: 'SAVE5',
            title: 'Save 5',
            amount: 5,
            amountCents: 500,
          },
        ],
        promotionApplications: [
          {
            promotionName: 'Automatic bundle offer',
            amount: 10,
            amountCents: 1000,
          },
        ],
      })

      await openCheckoutAndReviewPayment(page)
      await expect(page.getByText('Code discount (SAVE5)')).toBeVisible()
      await expect(page.getByText('Automatic bundle offer').first()).toBeVisible()
      await expect(page.getByText('Total discounts')).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-8-checkout-code-vs-promotion-discounts.png'),
        fullPage: true,
      })
    } finally {
      await context.close()
    }
  })

  test('captures cart note that automatic promotions are calculated at checkout', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    try {
      const page = await context.newPage()
      await seedCart(page)

      await page.goto('/shop', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Shop Everything' })).toBeVisible()
      await page.getByRole('button', { name: /Bag/i }).click()
      await expect(page.getByText('Automatic promotions are calculated at checkout.')).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-8-cart-promotion-note-or-deferred.png'),
        fullPage: true,
      })
    } finally {
      await context.close()
    }
  })
})

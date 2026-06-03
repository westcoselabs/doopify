import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { expect, test } from '@playwright/test'

type AuthSession = {
  email: string
  token: string
  userId: string
}

function readEnvValue(name: string): string {
  const envPath = join(process.cwd(), '.env')
  const source = readFileSync(envPath, 'utf8')
  const line = source
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))

  if (!line) {
    throw new Error(`Missing ${name} in .env`)
  }

  const rawValue = line.slice(line.indexOf('=') + 1).trim()
  return rawValue.replace(/^['"]|['"]$/g, '')
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = readEnvValue('DATABASE_URL')
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = readEnvValue('JWT_SECRET')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
})

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

async function createAdminSession(): Promise<AuthSession> {
  const jwtSecret = process.env.JWT_SECRET || readEnvValue('JWT_SECRET')
  const email = `playwright-smart-promotions-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used-by-e2e-snapshot',
      role: UserRole.ADMIN,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  })

  const sessionId = randomUUID()
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    },
    jwtSecret,
    { expiresIn: '7d' }
  )

  await prisma.session.create({
    data: {
      id: sessionId,
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      ip: '127.0.0.1',
      userAgent: 'playwright-smart-promotions',
    },
  })

  return {
    email,
    token,
    userId: user.id,
  }
}

async function cleanupAdminSession(session: AuthSession) {
  await prisma.session.deleteMany({
    where: {
      userId: session.userId,
    },
  })
  await prisma.user.deleteMany({
    where: {
      id: session.userId,
      email: session.email,
    },
  })
}

function promotionsListPayload() {
  return {
    promotions: [
      {
        id: 'promo_bundle_hoodie_hat',
        name: 'Hoodie + Hat bundle savings',
        type: 'PRODUCT_GROUP_DISCOUNT',
        status: 'ACTIVE',
        rewardType: 'PERCENTAGE',
        value: 15,
        usageCount: 12,
        usageLimit: 200,
        qualifierCount: 2,
        rewardCount: 0,
        priority: 100,
        updatedAt: '2026-05-28T10:00:00.000Z',
      },
      {
        id: 'promo_buyx_hat',
        name: 'Buy hoodie get hat 50% off',
        type: 'BUY_X_GET_Y',
        status: 'SCHEDULED',
        rewardType: 'PERCENTAGE',
        value: 50,
        usageCount: 0,
        usageLimit: null,
        qualifierCount: 1,
        rewardCount: 1,
        priority: 120,
        updatedAt: '2026-05-27T10:00:00.000Z',
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  }
}

function discountCodesListPayload() {
  return {
    discounts: [
      {
        id: 'disc_welcome10',
        title: 'WELCOME10',
        code: 'WELCOME10',
        type: 'CODE',
        method: 'PERCENTAGE',
        status: 'ACTIVE',
        value: 10,
        usageCount: 24,
        usageLimit: null,
        startsAt: '2026-05-01T00:00:00.000Z',
        endsAt: null,
        combinesWithOrders: false,
        combinesWithProducts: true,
        combinesWithShipping: false,
      },
      {
        id: 'disc_freeship',
        title: 'FREESHIP',
        code: 'FREESHIP',
        type: 'CODE',
        method: 'FREE_SHIPPING',
        status: 'SCHEDULED',
        value: 0,
        usageCount: 3,
        usageLimit: 50,
        startsAt: '2026-05-20T00:00:00.000Z',
        endsAt: null,
        combinesWithOrders: false,
        combinesWithProducts: false,
        combinesWithShipping: false,
      },
    ],
  }
}

function orderWithPromotionsPayload() {
  return {
    id: 'ord_promotions_visibility',
    orderNumber: '#7001',
    orderNumberValue: 7001,
    createdAt: '2026-05-28T12:00:00.000Z',
    sourceChannel: 'online',
    paymentStatusRaw: 'PAID',
    paymentStatus: 'paid',
    fulfillmentStatusRaw: 'UNFULFILLED',
    fulfillmentStatus: 'unfulfilled',
    shippingStatus: 'unknown',
    orderStatus: 'OPEN',
    status: 'open',
    currency: 'USD',
    subtotal: 90,
    shippingAmount: 0,
    shippingMethodName: null,
    taxAmount: 0,
    discountAmount: 12.5,
    total: 77.5,
    notes: '',
    shippingCapabilities: {
      connectedProviders: [],
      labelProvider: null,
    },
    availableActions: {
      canBuyShippingLabel: false,
      canMarkPaid: false,
      canMarkPaymentPending: true,
      canMarkFulfilled: true,
      canMarkUnfulfilled: false,
    },
    emailCapabilities: {
      hasCustomerEmail: true,
      providerConfigured: true,
    },
    lineItems: [
      {
        id: 'item_hoodie',
        title: 'Black Hoodie',
        variantTitle: 'Large',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
        total: 40,
        totalDiscount: 8,
        totalDiscountCents: 800,
        price: 40,
      },
      {
        id: 'item_hat',
        title: 'Classic Hat',
        variantTitle: 'Default',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
        total: 50,
        totalDiscount: 4.5,
        totalDiscountCents: 450,
        price: 50,
      },
    ],
    fulfillments: [],
    shippingLabels: [],
    discounts: [],
    promotionApplications: [
      {
        id: 'prom_app_1',
        promotionId: 'promo_bundle_hoodie_hat',
        name: 'Hoodie + Hat bundle savings',
        type: 'PRODUCT_GROUP_DISCOUNT',
        rewardType: 'PERCENTAGE',
        amount: 12.5,
        amountCents: 1250,
        lineAllocations: [
          {
            id: 'prom_line_1',
            orderItemId: 'item_hoodie',
            variantId: 'var_hoodie_large',
            quantityDiscounted: 1,
            discount: 8,
            discountCents: 800,
          },
          {
            id: 'prom_line_2',
            orderItemId: 'item_hat',
            variantId: 'var_hat_default',
            quantityDiscounted: 1,
            discount: 4.5,
            discountCents: 450,
          },
        ],
      },
    ],
    timeline: [],
    customerVisibleNotes: [],
    customer: {
      name: 'Promo Buyer',
      email: 'promo@example.com',
      phone: '555-0101',
    },
    shippingSummary: {
      address: {
        firstName: 'Promo',
        lastName: 'Buyer',
        company: null,
        address1: '101 Main St',
        address2: null,
        city: 'Los Angeles',
        province: 'CA',
        postalCode: '90001',
        country: 'US',
        phone: '555-0101',
      },
    },
    billingAddress: {
      firstName: 'Promo',
      lastName: 'Buyer',
      company: null,
      address1: '101 Main St',
      address2: null,
      city: 'Los Angeles',
      province: 'CA',
      postalCode: '90001',
      country: 'US',
      phone: '555-0101',
    },
    digitalDeliveryLoaded: false,
    timelineLoaded: false,
    fulfillmentLoaded: false,
    digitalDelivery: {
      hasDigitalItems: false,
      pending: false,
      deliveryEmailStatus: 'NOT_REQUIRED',
      grants: [],
    },
  }
}

async function mockPromotionsPageApis(page: import('@playwright/test').Page) {
  await page.route('**/api/discounts?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: discountCodesListPayload() }),
    })
  })

  await page.route('**/api/promotions?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: promotionsListPayload() }),
    })
  })
}

async function mockOrderDetailApis(page: import('@playwright/test').Page) {
  await page.route('**/api/orders/7001/detail', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: orderWithPromotionsPayload() }),
    })
  })

  await page.route('**/api/orders/7001/detail/timeline', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          timeline: [],
          events: [],
          customerVisibleNotes: [],
          timelineLoaded: true,
        },
      }),
    })
  })

  await page.route('**/api/orders/7001/detail/fulfillment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          fulfillments: [],
          shipments: [],
          shippingLabels: [],
          fulfillmentLoaded: true,
          shippingCapabilities: {
            labelProvider: null,
            providerConnected: false,
            connectedProviders: [],
            providerConnectionByName: {},
            providerUsage: null,
            canBuyShippingLabel: false,
          },
          emailCapabilities: {
            hasCustomerEmail: true,
            providerConfigured: true,
          },
          availableActions: {
            canBuyShippingLabel: false,
          },
        },
      }),
    })
  })

  await page.route('**/api/orders/7001/digital-delivery', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          orderId: 'ord_promotions_visibility',
          orderNumber: 7001,
          hasDigitalItems: false,
          pending: false,
          deliveryEmailStatus: 'NOT_REQUIRED',
          grants: [],
        },
      }),
    })
  })
}

test.describe('Smart Promotions visibility smoke screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('captures promotions admin workspace screenshots', async ({ browser }) => {
    const session = await createAdminSession()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    try {
      await context.addCookies([
        {
          name: 'doopify_token',
          value: session.token,
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Strict',
        },
      ])

      const page = await context.newPage()
      await mockPromotionsPageApis(page)

      await page.goto('/discounts', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Promotions' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Discount codes', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Automatic', exact: true })).toBeVisible()
      await expect(page.getByPlaceholder('Search promotions...')).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Method' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible()
      await expect(page.getByText('Hoodie + Hat bundle savings')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('WELCOME10')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('tbody').getByText('Code', { exact: true })).toHaveCount(2)
      await expect(page.locator('tbody').getByText('Automatic', { exact: true })).toHaveCount(2)
      await expect(page.getByText('Amount off products')).toBeVisible()
      await expect(page.getByText('Product group discount')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Disable' }).first()).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-5-unified-promotions-list.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'Automatic', exact: true }).click()
      await expect(page.getByText('WELCOME10')).toHaveCount(0)
      await expect(page.getByText('Hoodie + Hat bundle savings')).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-5-filter-automatic.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'All', exact: true }).click()
      await page.getByRole('banner').getByRole('button', { name: 'Create promotion' }).click()
      await expect(page.getByRole('heading', { name: 'Create promotion' })).toBeVisible()
      const createDrawer = page.getByRole('dialog', { name: 'Create promotion' })
      await expect(createDrawer.getByRole('heading', { name: 'How should this promotion work?' })).toBeVisible()
      await expect(createDrawer.getByRole('radio', { name: /Discount code/i })).toBeVisible()
      await expect(createDrawer.getByRole('radio', { name: /Automatic offer/i })).toBeVisible()
      await expect(createDrawer.getByText('Customer enters a code at checkout.')).toBeVisible()
      await expect(createDrawer.getByText('Applies automatically when cart rules are met.')).toBeVisible()
      await expect(createDrawer.getByText('Best for: SUMMER20, VIP offers, free shipping.')).toBeVisible()
      await expect(createDrawer.getByText('Best for: bundles, Buy X Get Y, free gifts.')).toBeVisible()
      await expect(createDrawer.getByText('Reward items must already be in cart for Buy X Get Y and Free Gift in V1.')).toHaveCount(0)
      await expect(createDrawer.getByText('Code', { exact: true })).toHaveCount(1)
      await expect(createDrawer.getByText('Automatic', { exact: true })).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Continue to type' })).toBeDisabled()

      await page.screenshot({
        path: screenshotPath('phase-9-5-create-method-selection.png'),
        fullPage: true,
      })

      await createDrawer.getByRole('radio', { name: /Discount code/i }).click()
      await expect(createDrawer.getByRole('radio', { name: /Discount code/i })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('button', { name: 'Continue to type' })).toBeEnabled()
      await page.getByRole('button', { name: 'Continue to type' }).click()
      await expect(createDrawer.getByRole('heading', { name: 'Choose discount code type' })).toBeVisible()
      await expect(page.getByRole('radio', { name: /Amount off products/i })).toBeVisible()
      await expect(page.getByRole('radio', { name: /Amount off order/i })).toBeVisible()
      await expect(page.getByRole('radio', { name: /Free shipping/i })).toBeVisible()
      await expect(createDrawer.getByText('Discount selected products or variants.')).toBeVisible()
      await expect(createDrawer.getByText('Remove shipping cost with a code.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Continue to details' })).toBeDisabled()

      await page.screenshot({
        path: screenshotPath('phase-9-4-code-type-selection.png'),
        fullPage: true,
      })

      await page.getByRole('radio', { name: /Amount off order/i }).click()
      await expect(page.getByRole('button', { name: 'Continue to details' })).toBeEnabled()
      await page.getByRole('button', { name: 'Continue to details' }).click()
      await expect(page.getByRole('heading', { name: 'Discount code details' })).toBeVisible()
      await expect(page.getByText('Looking for Buy X Get Y, Free Gift, or product group savings? Use an automatic promotion type.')).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-2-discount-code-details.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'Back' }).click()
      await expect(createDrawer.getByRole('heading', { name: 'Choose discount code type' })).toBeVisible()
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(createDrawer.getByRole('heading', { name: 'How should this promotion work?' })).toBeVisible()
      await createDrawer.getByRole('radio', { name: /Automatic offer/i }).click()
      await expect(createDrawer.getByRole('radio', { name: /Automatic offer/i })).toHaveAttribute('aria-checked', 'true')
      await page.getByRole('button', { name: 'Continue to type' }).click()
      await expect(createDrawer.getByRole('heading', { name: 'Choose automatic offer type' })).toBeVisible()
      await expect(createDrawer.getByText("These offers apply when the customer's cart matches your rules.").first()).toBeVisible()
      await expect(createDrawer.getByText("V1 note: Buy X Get Y and Free Gift do not auto-add reward items. Reward items must already be in the customer's cart.")).toBeVisible()
      await expect(createDrawer.getByText('Reward item must already be in cart.')).toHaveCount(0)
      await expect(createDrawer.getByText('Gift item must already be in cart.')).toHaveCount(0)

      await page.screenshot({
        path: screenshotPath('phase-9-4-automatic-type-selection.png'),
        fullPage: true,
      })

      await page.getByRole('radio', { name: /Product group discount/i }).click()
      await page.getByRole('button', { name: 'Continue to details' }).click()
      await expect(
        page.getByText('Product group discounts apply to the selected qualifier products only in V1.')
      ).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-4-product-group-details.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'Back' }).click()
      await expect(createDrawer.getByRole('heading', { name: 'Choose automatic offer type' })).toBeVisible()
      await page.getByRole('radio', { name: /Buy X Get Y/i }).click()
      await page.getByRole('button', { name: 'Continue to details' }).click()
      await expect(
        page.getByText("Reward items must already be in the customer's cart. Auto-add gifts are not enabled in V1.")
      ).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-4-buy-x-get-y-details.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: 'Back' }).click()
      await page.getByRole('radio', { name: /Free gift/i }).click()
      await page.getByRole('button', { name: 'Continue to details' }).click()
      await expect(
        page.getByText("Gift items must already be in the customer's cart. Auto-add gifts are not enabled in V1.")
      ).toBeVisible()

      await page.screenshot({
        path: screenshotPath('phase-9-2-free-gift-details.png'),
        fullPage: true,
      })
    } finally {
      await context.close()
      await cleanupAdminSession(session)
    }
  })

  test('captures order detail promotion summary screenshot', async ({ browser }) => {
    const session = await createAdminSession()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

    try {
      await context.addCookies([
        {
          name: 'doopify_token',
          value: session.token,
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Strict',
        },
      ])

      const page = await context.newPage()
      await mockOrderDetailApis(page)

      await page.goto('/orders/7001', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: '#7001' })).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Promotions applied')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Hoodie + Hat bundle savings')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Product group discount')).toBeVisible({ timeout: 15000 })

      await page.screenshot({
        path: screenshotPath('phase-7-order-promotion-summary.png'),
        fullPage: true,
      })
    } finally {
      await context.close()
      await cleanupAdminSession(session)
    }
  })
})

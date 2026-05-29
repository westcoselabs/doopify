import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

async function createAdminSession(): Promise<AuthSession> {
  const jwtSecret = process.env.JWT_SECRET || readEnvValue('JWT_SECRET')
  const email = `playwright-digital-polish-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`

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
      userAgent: 'playwright-digital-polish',
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

function buildOrderDetailPayload() {
  return {
    id: 'ord_digital_polish',
    orderNumber: '#1001',
    orderNumberValue: 1001,
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
    subtotal: 19,
    shippingAmount: 0,
    shippingMethodName: null,
    taxAmount: 0,
    discountAmount: 0,
    total: 19,
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
        id: 'item_digital_1',
        title: 'Digital Field Guide',
        variantTitle: 'Default',
        fulfillmentType: 'DIGITAL',
        quantity: 1,
        total: 19,
        totalDiscount: 0,
        price: 19,
      },
    ],
    fulfillments: [],
    shippingLabels: [],
    discounts: [],
    timeline: [],
    customerVisibleNotes: [],
    customer: {
      name: 'Digital Buyer',
      email: 'digital@example.com',
      phone: '555-0100',
    },
    shippingSummary: {
      address: null,
    },
    billingAddress: null,
    digitalDeliveryLoaded: false,
    timelineLoaded: false,
    fulfillmentLoaded: false,
    digitalDelivery: {
      hasDigitalItems: true,
      pending: false,
      deliveryEmailStatus: 'SENT',
      grants: [],
    },
  }
}

function buildDigitalDeliveryPayload() {
  return {
    orderId: 'ord_digital_polish',
    orderNumber: 1001,
    hasDigitalItems: true,
    pending: false,
    deliveryEmailStatus: 'SENT',
    deliveryEmailLastSentAt: '2026-05-28T13:00:00.000Z',
    grants: [
      {
        grantId: 'grant_active',
        orderItemId: 'item_digital_1',
        digitalAssetId: 'asset_1',
        fileName: 'guide.pdf',
        title: 'Digital Field Guide',
        status: 'ACTIVE',
        downloadCount: 1,
        downloadLimit: 5,
        expiresAt: '2099-12-31T20:00:00.000Z',
        revokedAt: null,
        lastDownloadedAt: '2026-05-28T13:00:00.000Z',
        deliveryEmailStatus: 'SENT',
        deliveryTokenAvailable: true,
        events: [],
      },
      {
        grantId: 'grant_revoked',
        orderItemId: 'item_digital_1',
        digitalAssetId: 'asset_2',
        fileName: 'bonus.pdf',
        title: 'Bonus Download',
        status: 'REVOKED',
        downloadCount: 0,
        downloadLimit: 5,
        expiresAt: '2099-12-31T20:00:00.000Z',
        revokedAt: '2026-05-28T14:00:00.000Z',
        lastDownloadedAt: null,
        deliveryEmailStatus: 'SENT',
        deliveryTokenAvailable: true,
        events: [],
      },
    ],
  }
}

async function mockOrderDetailApis(page: import('@playwright/test').Page) {
  const orderDetailPayload = buildOrderDetailPayload()
  const digitalDeliveryPayload = buildDigitalDeliveryPayload()

  await page.route('**/api/orders/1001/detail', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: orderDetailPayload }),
    })
  })

  await page.route('**/api/orders/1001/detail/timeline', async (route) => {
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

  await page.route('**/api/orders/1001/detail/fulfillment', async (route) => {
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

  await page.route('**/api/orders/1001/digital-delivery', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: digitalDeliveryPayload }),
    })
  })
}

const viewportTargets = [
  {
    label: 'desktop-1440x900',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  {
    label: 'mobile-390x844',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
]

for (const target of viewportTargets) {
  test.describe(`Digital Order Polish Snapshots - ${target.label}`, () => {
    test.use({
      viewport: target.viewport,
      isMobile: target.isMobile,
      hasTouch: target.hasTouch,
    })

    test('captures digital-only order detail polish', async ({ browser }, testInfo) => {
      const session = await createAdminSession()
      const context = await browser.newContext({
        viewport: target.viewport,
        isMobile: target.isMobile,
        hasTouch: target.hasTouch,
      })

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

        await page.goto('/orders/1001', { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: '#1001' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Digital fulfillment' })).toBeVisible()
        await expect(
          page.getByText('This order is fulfilled by secure download access. No shipping or tracking is required.')
        ).toBeVisible()
        await expect(page.getByText('2 files prepared')).toBeVisible()
        await expect(page.getByText('1 active · 1 revoked')).toBeVisible()
        await expect(page.getByText('Shipping - Not required')).toBeVisible()
        await expect(page.getByText('Digital orders are delivered by secure download link.')).toBeVisible()
        await expect(
          page.getByText('Manage download links and resend access in the Digital delivery card.')
        ).toBeVisible()
        await expect(page.getByRole('button', { name: 'Copy link' }).first()).toBeVisible()
        await expect(page.getByRole('button', { name: 'Resend email' }).first()).toBeVisible()

        await page.waitForLoadState('networkidle')
        await page.screenshot({
          path: testInfo.outputPath(`${target.label}-digital-order-detail-polish.png`),
          fullPage: true,
        })
      } finally {
        await context.close()
        await cleanupAdminSession(session)
      }
    })
  })
}

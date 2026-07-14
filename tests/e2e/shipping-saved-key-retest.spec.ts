import { randomUUID } from 'node:crypto'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { expect, test } from '@playwright/test'

import { hashSessionToken } from '@/lib/session-token'

const databaseUrlTest = String(process.env.DATABASE_URL_TEST || '').trim()
if (!databaseUrlTest) throw new Error('DATABASE_URL_TEST is required for mutation-capable E2E tests.')
const jwtSecret = String(process.env.E2E_JWT_SECRET || process.env.JWT_SECRET || '').trim()
if (!jwtSecret) throw new Error('E2E_JWT_SECRET or JWT_SECRET is required for test-session signing.')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrlTest }),
})

type OwnerSession = {
  email: string
  token: string
  userId: string
}

async function createOwnerSession(): Promise<OwnerSession> {
  const email = `playwright-shipping-owner-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`

  await prisma.store.upsert({
    where: { singletonKey: 'PRIMARY' },
    update: {},
    create: {
      singletonKey: 'PRIMARY',
      name: 'Playwright Shipping Store',
      email: 'playwright-shipping@example.com',
      currency: 'USD',
    },
  })

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'not-used-by-e2e',
      role: UserRole.OWNER,
      isActive: true,
    },
    select: { id: true, email: true, role: true },
  })
  const sessionId = randomUUID()
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, sessionId },
    jwtSecret,
    { expiresIn: '7d' }
  )

  await prisma.session.create({
    data: {
      id: sessionId,
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      ip: '127.0.0.1',
      userAgent: 'playwright-shipping-saved-key-retest',
    },
  })

  return { email, token, userId: user.id }
}

async function cleanupOwnerSession(session: OwnerSession) {
  await prisma.session.deleteMany({ where: { userId: session.userId } })
  await prisma.user.deleteMany({ where: { id: session.userId, email: session.email } })
}

function shippingPayload() {
  return {
    storeId: 'store_shipping_e2e',
    currency: 'USD',
    shippingMode: 'MANUAL',
    activeRateProvider: 'SHIPPO',
    labelProvider: 'SHIPPO',
    fallbackBehavior: 'SHOW_FALLBACK',
    shippingProviderUsage: 'LIVE_AND_LABELS',
    shippingPackages: [],
    shippingLocations: [],
    shippingManualRates: [],
    shippingFallbackRates: [],
    shippingZones: [],
  }
}

function setupStatusPayload() {
  return {
    providerVerificationStatus: 'verified',
    providerLastVerifiedAt: '2026-07-14T12:00:00.000Z',
    providerLastError: null,
    providerConnected: true,
    labelProviderConnected: true,
    hasFallbackRate: false,
    shippingProviderConnections: {
      SHIPPO: {
        connected: true,
        hasCredentials: true,
        verificationStatus: 'verified',
      },
      EASYPOST: {
        connected: false,
        hasCredentials: false,
        verificationStatus: 'not_configured',
      },
    },
  }
}

test.describe('Shipping provider saved-key retest', () => {
  test('an owner retests the saved Shippo key without sending a key, then close/reopens and reloads canonical status', async ({ browser }) => {
    const session = await createOwnerSession()
    const context = await browser.newContext()
    const page = await context.newPage()
    const testRequests: Array<Record<string, unknown>> = []
    let shippingLoads = 0
    let setupStatusLoads = 0

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

      await page.route('**/api/settings/shipping', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        shippingLoads += 1
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: shippingPayload() }),
        })
      })
      await page.route('**/api/settings/shipping/setup-status', async (route) => {
        setupStatusLoads += 1
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: setupStatusPayload() }),
        })
      })
      await page.route('**/api/settings/shipping/test-provider', async (route) => {
        testRequests.push(JSON.parse(route.request().postData() || '{}'))
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { result: { ok: true, message: 'Saved Shippo key verified.' } },
          }),
        })
      })

      await page.goto('/admin/settings/shipping', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Shipping & delivery' })).toBeVisible()
      await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible()

      const providerConnectionRow = page.getByText('Provider connection', { exact: true }).locator('xpath=../..')
      await providerConnectionRow.getByRole('button', { name: 'Manage', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: 'Manage provider' })
      await expect(drawer).toBeVisible()
      await expect(drawer.getByLabel('API token')).toHaveValue('')
      await drawer.getByRole('button', { name: 'Test connection', exact: true }).click()
      await expect(drawer.getByText('Saved Shippo key verified.')).toBeVisible()
      expect(testRequests).toEqual([{ provider: 'SHIPPO' }])
      await expect.poll(() => shippingLoads).toBeGreaterThanOrEqual(2)
      await expect.poll(() => setupStatusLoads).toBeGreaterThanOrEqual(2)

      await drawer.getByRole('button', { name: 'Close drawer' }).click()
      await expect(drawer).toBeHidden()
      await providerConnectionRow.getByRole('button', { name: 'Manage', exact: true }).click()
      await expect(drawer).toBeVisible()
      await expect(drawer.getByLabel('API token')).toHaveValue('')

      const shippingLoadsBeforeReload = shippingLoads
      const setupStatusLoadsBeforeReload = setupStatusLoads
      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Shipping & delivery' })).toBeVisible()
      await expect.poll(() => shippingLoads).toBeGreaterThan(shippingLoadsBeforeReload)
      await expect.poll(() => setupStatusLoads).toBeGreaterThan(setupStatusLoadsBeforeReload)
    } finally {
      await context.close()
      await cleanupOwnerSession(session)
    }
  })
})

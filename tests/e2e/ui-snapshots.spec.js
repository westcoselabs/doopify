import { test, expect } from '@playwright/test'

const snapshotTargets = [
  {
    key: 'login',
    path: '/login',
    assertReady: async (page) => {
      await expect(page.getByPlaceholder('Email address')).toBeVisible()
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    },
  },
  {
    key: 'shop',
    path: '/shop',
    assertReady: async (page) => {
      await expect(page.getByRole('heading', { name: 'Shop Everything' })).toBeVisible()
    },
  },
  {
    key: 'checkout-empty',
    path: '/checkout',
    assertReady: async (page) => {
      await expect(page.getByText('Your cart is empty right now.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Return to the shop' })).toBeVisible()
    },
  },
  {
    key: 'admin-unauth-redirect',
    path: '/admin',
    assertReady: async (page) => {
      await expect(page).toHaveURL(/\/login(\?|$)/)
      await expect(page.getByPlaceholder('Email address')).toBeVisible()
    },
  },
]

function collectMajorConsoleErrors(page) {
  const majorErrors = []

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return
    }
    majorErrors.push({
      source: 'console',
      text: message.text(),
      location: message.location(),
    })
  })

  page.on('pageerror', (error) => {
    majorErrors.push({
      source: 'pageerror',
      text: String(error?.message || error),
    })
  })

  return majorErrors
}

function isExpectedUnauth401ResourceError(errorEntry) {
  if (errorEntry?.source !== 'console') {
    return false
  }

  if (
    !String(errorEntry?.text || '').includes(
      'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
    )
  ) {
    return false
  }

  const url = String(errorEntry?.location?.url || '')
  return /\/api\/(discounts|customers|orders|products|settings)(\?|$)/.test(url)
}

function runSnapshotCases(viewportLabel) {
  for (const target of snapshotTargets) {
    test(`${target.key} snapshot`, async ({ page }, testInfo) => {
      const majorErrors = collectMajorConsoleErrors(page)

      await page.goto(target.path)
      await target.assertReady(page)
      await page.waitForLoadState('networkidle')

      const screenshotName = `${viewportLabel}-${target.key}.png`
      await page.screenshot({
        path: testInfo.outputPath(screenshotName),
        fullPage: true,
      })

      if (majorErrors.length > 0) {
        await testInfo.attach(`${viewportLabel}-${target.key}-console-errors.json`, {
          body: JSON.stringify(majorErrors, null, 2),
          contentType: 'application/json',
        })
      }

      const unexpectedMajorErrors = majorErrors.filter(
        (errorEntry) => !isExpectedUnauth401ResourceError(errorEntry)
      )
      expect(
        unexpectedMajorErrors,
        `Unexpected major console errors detected for ${viewportLabel}/${target.key}`
      ).toEqual([])
    })
  }
}

test.describe('Pilot UI Snapshots - Desktop', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
  })

  runSnapshotCases('desktop-1440x900')
})

test.describe('Pilot UI Snapshots - Mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })

  runSnapshotCases('mobile-390x844')
})

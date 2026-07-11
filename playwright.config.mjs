import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const isLocalBaseURL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseURL)
const databaseUrlTest = String(process.env.DATABASE_URL_TEST || '').trim()

if (!isLocalBaseURL && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to run E2E against non-local base URL "${baseURL}". Set E2E_ALLOW_REMOTE=1 to override.`
  )
}

if (!databaseUrlTest) {
  throw new Error('Refusing to run E2E without DATABASE_URL_TEST configured for disposable storage.')
}

if (databaseUrlTest === process.env.DATABASE_URL) {
  throw new Error('Refusing to run E2E: DATABASE_URL_TEST must not match DATABASE_URL.')
}

try {
  const schema = new URL(databaseUrlTest).searchParams.get('schema') || 'public'
  if (schema === 'public' && process.env.ALLOW_PUBLIC_TEST_SCHEMA !== '1') {
    throw new Error('E2E requires DATABASE_URL_TEST with a dedicated non-public schema.')
  }
} catch (error) {
  if (error instanceof Error && error.message.includes('dedicated non-public schema')) {
    throw error
  }
  throw new Error('E2E requires a valid DATABASE_URL_TEST connection string with a dedicated schema.')
}

// Playwright worker code and the local Next server must share the disposable
// database; never let either fall through to .env's normal DATABASE_URL.
process.env.DATABASE_URL = databaseUrlTest

const useWebServer = isLocalBaseURL && process.env.E2E_SKIP_WEBSERVER !== '1'
function isPlaceholderStripeValue(value) {
  if (!value) return true
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return true
  return (
    normalized.includes('replace_me') ||
    normalized.includes('placeholder') ||
    normalized.includes('visibility_only')
  )
}

const stripeSecretKeyForE2E = isPlaceholderStripeValue(process.env.STRIPE_SECRET_KEY)
  ? 'sk_test_e2e_visibility_only'
  : process.env.STRIPE_SECRET_KEY

const stripePublishableKeyForE2E = isPlaceholderStripeValue(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
)
  ? 'pk_test_e2e_visibility_only'
  : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

const e2eWebServerEnv = {
  ...process.env,
  DATABASE_URL: databaseUrlTest,
  DATABASE_URL_TEST: databaseUrlTest,
  JWT_SECRET: process.env.E2E_JWT_SECRET || 'e2e-local-only-jwt-secret-with-at-least-32-characters',
  STRIPE_SECRET_KEY: stripeSecretKeyForE2E,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKeyForE2E,
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: useWebServer
      ? {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
        env: e2eWebServerEnv,
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

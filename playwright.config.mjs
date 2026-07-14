import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

import { createInertTestEnvironment, EXTERNAL_CREDENTIAL_ENV_NAMES } from './scripts/test-environment.mjs'

loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

// Never attach release E2E to an arbitrary app already running on the common
// development port. The configured local server is always this checkout.
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100'
const isLocalBaseURL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseURL)
const configuredE2eDatabaseUrl = String(process.env.E2E_DATABASE_URL || '').trim()
const databaseUrlTest = configuredE2eDatabaseUrl || String(process.env.DATABASE_URL_TEST || '').trim()
const originalDatabaseUrl = String(process.env.E2E_ORIGINAL_DATABASE_URL || process.env.DATABASE_URL || '').trim()

if (!isLocalBaseURL && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to run E2E against non-local base URL "${baseURL}". Set E2E_ALLOW_REMOTE=1 to override.`
  )
}

if (!databaseUrlTest) {
  throw new Error('Refusing to run E2E without DATABASE_URL_TEST configured for disposable storage.')
}

if (configuredE2eDatabaseUrl && configuredE2eDatabaseUrl !== String(process.env.DATABASE_URL_TEST || '').trim()) {
  throw new Error('Refusing to run E2E: E2E_DATABASE_URL must match DATABASE_URL_TEST.')
}

if (databaseUrlTest === originalDatabaseUrl) {
  throw new Error('Refusing to run E2E: DATABASE_URL_TEST must not match DATABASE_URL.')
}

try {
  const schema = new URL(databaseUrlTest).searchParams.get('schema') || 'public'
  // E2E requires a dedicated non-public schema by default. A separately
  // configured E2E_DATABASE_URL is the explicit disposable-database override.
  if (schema === 'public' && !configuredE2eDatabaseUrl) {
    throw new Error('E2E requires E2E_DATABASE_URL when using a public disposable test schema.')
  }
} catch (error) {
  if (error instanceof Error && error.message.includes('E2E requires')) {
    throw error
  }
  throw new Error('E2E requires a valid DATABASE_URL_TEST connection string with a dedicated schema.')
}

// Playwright worker code and the local Next server must share the disposable
// database; never let either fall through to .env's normal DATABASE_URL.
const inertE2eEnvironment = createInertTestEnvironment(process.env)
for (const name of EXTERNAL_CREDENTIAL_ENV_NAMES) delete process.env[name]
Object.assign(process.env, inertE2eEnvironment)
process.env.E2E_ORIGINAL_DATABASE_URL = originalDatabaseUrl
process.env.DATABASE_URL = databaseUrlTest
const jwtSecretForE2E = process.env.E2E_JWT_SECRET || 'e2e-local-only-jwt-secret-with-at-least-32-characters'
process.env.JWT_SECRET = jwtSecretForE2E

const useWebServer = isLocalBaseURL && process.env.E2E_SKIP_WEBSERVER !== '1'
const e2eWebServerEnv = {
  ...inertE2eEnvironment,
  DATABASE_URL: databaseUrlTest,
  DATABASE_URL_TEST: databaseUrlTest,
  JWT_SECRET: jwtSecretForE2E,
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // These specs seed and clean one disposable schema. Keep workers serial so
  // one scenario cannot remove another scenario's Store or owner mid-render.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: useWebServer
      ? {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
        env: e2eWebServerEnv,
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: false,
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

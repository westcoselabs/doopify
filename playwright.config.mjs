import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const isLocalBaseURL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseURL)

if (!isLocalBaseURL && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing to run E2E against non-local base URL "${baseURL}". Set E2E_ALLOW_REMOTE=1 to override.`
  )
}

const useWebServer = isLocalBaseURL && process.env.E2E_SKIP_WEBSERVER !== '1'
const e2eWebServerEnv = {
  ...process.env,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_e2e_visibility_only',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_e2e_visibility_only',
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

import { spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'

// Next.js auto-loads .env / .env.local at runtime, but a plain `node` script
// does not. Load them here so `npm run test:integration` works out of the box.
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

if (!process.env.DATABASE_URL_TEST) {
  console.log('Skipping integration tests: DATABASE_URL_TEST is not configured.')
  process.exit(0)
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST) {
  console.error('Refusing to run integration tests: DATABASE_URL_TEST must not match DATABASE_URL.')
  process.exit(1)
}

function resolveSchemaName(databaseUrlTest) {
  try {
    const url = new URL(databaseUrlTest)
    return url.searchParams.get('schema') || ''
  } catch {
    return ''
  }
}

const prismaPgSchema = resolveSchemaName(process.env.DATABASE_URL_TEST)

function normalizeCredential(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function hasRealCredential(value) {
  const normalized = normalizeCredential(value)?.toLowerCase()
  if (!normalized) return false
  if (
    normalized === 'sk_test_replace_me' ||
    normalized === 'pk_test_replace_me' ||
    normalized === 'whsec_replace_me'
  ) {
    return false
  }
  return !(
    normalized.includes('replace_me') ||
    normalized.includes('replace-with') ||
    normalized.includes('replace_with') ||
    normalized.includes('example_key') ||
    normalized.includes('example_secret')
  )
}

const stripeSecretKey = hasRealCredential(process.env.STRIPE_SECRET_KEY)
  ? process.env.STRIPE_SECRET_KEY
  : 'sk_test_integration_runner'
const stripePublishableKey = hasRealCredential(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  : 'pk_test_integration_runner'
const stripeWebhookSecret = hasRealCredential(process.env.STRIPE_WEBHOOK_SECRET)
  ? process.env.STRIPE_WEBHOOK_SECRET
  : 'whsec_integration_runner'

const runEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL_TEST,
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  PRISMA_PG_SCHEMA: prismaPgSchema,
  STRIPE_SECRET_KEY: stripeSecretKey,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
  NODE_ENV: 'test',
}

const npmExecPath = process.env.npm_execpath

const prepareResult = npmExecPath
  ? spawnSync(
      process.execPath,
      ['scripts/prepare-integration-db.mjs'],
      {
        stdio: 'inherit',
        env: process.env,
      }
    )
  : spawnSync(
      process.execPath,
      ['scripts/prepare-integration-db.mjs'],
      {
        stdio: 'inherit',
        env: process.env,
      }
    )

if ((prepareResult.status ?? 1) !== 0) {
  process.exit(prepareResult.status ?? 1)
}

const result = npmExecPath
  ? spawnSync(
      process.execPath,
      [npmExecPath, 'exec', '--', 'vitest', 'run', '--config', 'vitest.integration.config.ts', '--no-file-parallelism'],
      {
        stdio: 'inherit',
        env: runEnv,
      }
    )
  : spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vitest', 'run', '--config', 'vitest.integration.config.ts', '--no-file-parallelism'],
      {
        stdio: 'inherit',
        env: runEnv,
      }
    )

process.exit(result.status ?? 1)

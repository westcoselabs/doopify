import { spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'

import { createInertTestEnvironment } from './test-environment.mjs'

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

const runEnv = {
  ...createInertTestEnvironment(process.env),
  DATABASE_URL: process.env.DATABASE_URL_TEST,
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  PRISMA_PG_SCHEMA: prismaPgSchema,
  DOOPIFY_TEST_DATABASE_URL: '1',
  ...(process.env.E2E_DATABASE_URL ? { ALLOW_PUBLIC_TEST_SCHEMA: '1' } : {}),
  NODE_ENV: 'test',
}

const npmExecPath = process.env.npm_execpath

const prepareResult = npmExecPath
  ? spawnSync(
      process.execPath,
      ['scripts/prepare-integration-db.mjs'],
      {
        stdio: 'inherit',
        env: runEnv,
      }
    )
  : spawnSync(
      process.execPath,
      ['scripts/prepare-integration-db.mjs'],
      {
        stdio: 'inherit',
        env: runEnv,
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

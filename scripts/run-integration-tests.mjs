import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

import { createInertTestEnvironment } from './test-environment.mjs'
import { evaluateTestDatabaseResetSafety, schemaFromTestDatabaseUrl } from './test-database-safety.mjs'

function runVitest(env) {
  const npmExecPath = process.env.npm_execpath
  return npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, 'exec', '--', 'vitest', 'run', '--config', 'vitest.integration.config.ts', '--no-file-parallelism'], { stdio: 'inherit', env })
    : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts', '--no-file-parallelism'], { stdio: 'inherit', env })
}

export function buildIntegrationTestEnvironments(environment) {
  const safety = evaluateTestDatabaseResetSafety({
    databaseUrlTest: environment.DATABASE_URL_TEST,
    e2eDatabaseUrl: environment.E2E_DATABASE_URL,
    databaseUrl: environment.DATABASE_URL,
    publicSchemaAcknowledged: environment.DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA === '1',
  })
  if (!safety.ok) return { ok: false, reason: safety.reason }

  const { DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA: _publicAcknowledgement, ALLOW_PUBLIC_TEST_SCHEMA: _internalPermission, ...parentEnvironment } = environment
  const baseEnvironment = {
    ...createInertTestEnvironment(parentEnvironment),
    DATABASE_URL: environment.DATABASE_URL_TEST,
    DATABASE_URL_TEST: environment.DATABASE_URL_TEST,
    PRISMA_PG_SCHEMA: schemaFromTestDatabaseUrl(environment.DATABASE_URL_TEST) || '',
    DOOPIFY_TEST_DATABASE_URL: '1',
    NODE_ENV: 'test',
  }

  return {
    ok: true,
    testEnvironment: baseEnvironment,
    prepareEnvironment: {
      ...baseEnvironment,
      ...(environment.DATABASE_URL ? { DOOPIFY_NORMAL_DATABASE_URL: environment.DATABASE_URL } : {}),
      ...(safety.allowPublicSchemaReset ? { ALLOW_PUBLIC_TEST_SCHEMA: '1' } : {}),
    },
  }
}

async function main() {
  // Next.js auto-loads .env / .env.local at runtime, but a plain node script
  // does not. Load them here so the opt-in integration command can read its
  // dedicated target without inheriting provider credentials in child tests.
  loadEnv({ path: '.env', quiet: true })
  loadEnv({ path: '.env.local', override: true, quiet: true })

  if (!process.env.DATABASE_URL_TEST) {
    console.log('Skipping integration tests: DATABASE_URL_TEST is not configured.')
    return
  }

  const environments = buildIntegrationTestEnvironments(process.env)
  if (!environments.ok) throw new Error(`Refusing to reset integration database: ${environments.reason}`)

  const prepareResult = spawnSync(process.execPath, ['scripts/prepare-integration-db.mjs'], {
    stdio: 'inherit',
    env: environments.prepareEnvironment,
  })
  if ((prepareResult.status ?? 1) !== 0) process.exitCode = prepareResult.status ?? 1
  if (process.exitCode) return

  const result = runVitest(environments.testEnvironment)
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Integration test setup failed.')
    process.exitCode = 1
  })
}

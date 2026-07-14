import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

import { createInertTestEnvironment } from './test-environment.mjs'
import { evaluateTestDatabaseResetSafety } from './test-database-safety.mjs'

const { Client } = pg

export async function resetIntegrationSchema({ environment, createClient }) {
  const safety = evaluateTestDatabaseResetSafety({
    databaseUrlTest: environment.DATABASE_URL_TEST,
    e2eDatabaseUrl: environment.E2E_DATABASE_URL,
    databaseUrl: environment.DOOPIFY_NORMAL_DATABASE_URL ?? environment.DATABASE_URL,
    publicSchemaAcknowledged: environment.DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA === '1' || environment.ALLOW_PUBLIC_TEST_SCHEMA === '1',
  })
  if (!safety.ok) return { ok: false, reason: safety.reason, dropped: false }

  const client = createClient ? createClient(environment.DATABASE_URL_TEST) : new Client({ connectionString: environment.DATABASE_URL_TEST })
  await client.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${safety.target.schema.replaceAll('"', '""')}" CASCADE`)
    return { ok: true, dropped: true, target: safety.target }
  } finally {
    await client.end()
  }
}

function runPrismaPush(environment) {
  const npmExecPath = process.env.npm_execpath
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, 'exec', '--', 'prisma', 'db', 'push', '--accept-data-loss'], { stdio: 'inherit', env: environment })
    : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'db', 'push', '--accept-data-loss'], { stdio: 'inherit', env: environment })
  return result.status ?? 1
}

async function main() {
  loadEnv({ path: '.env', quiet: true })
  loadEnv({ path: '.env.local', override: true, quiet: true })
  const reset = await resetIntegrationSchema({ environment: process.env })
  if (!reset.ok) throw new Error(`Refusing to reset integration database: ${reset.reason}`)

  const { DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA: _publicAcknowledgement, DOOPIFY_NORMAL_DATABASE_URL: _normalDatabaseUrl, ALLOW_PUBLIC_TEST_SCHEMA: _internalPermission, ...parentEnvironment } = process.env
  const runEnvironment = {
    ...createInertTestEnvironment(parentEnvironment),
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
    DIRECT_URL: process.env.DATABASE_URL_TEST,
    NODE_ENV: 'test',
  }
  process.exitCode = runPrismaPush(runEnvironment)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Integration database preparation failed.')
    process.exitCode = 1
  })
}

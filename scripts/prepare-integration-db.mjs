import { spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

import { createInertTestEnvironment } from './test-environment.mjs'

const { Client } = pg

loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

if (!process.env.DATABASE_URL_TEST) {
  console.error('DATABASE_URL_TEST is required to prepare the integration test database.')
  process.exit(1)
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST && process.env.DOOPIFY_TEST_DATABASE_URL !== '1') {
  console.error('Refusing to prepare integration DB: DATABASE_URL_TEST must not match DATABASE_URL.')
  process.exit(1)
}

function resolveSchemaName(databaseUrlTest) {
  try {
    const url = new URL(databaseUrlTest)
    return url.searchParams.get('schema') || 'public'
  } catch {
    return 'public'
  }
}

const schemaName = resolveSchemaName(process.env.DATABASE_URL_TEST)

if (schemaName === 'public' && process.env.ALLOW_PUBLIC_TEST_SCHEMA !== '1') {
  console.error(
    'Refusing to reset integration DB schema "public". Set DATABASE_URL_TEST with a dedicated schema or explicitly set ALLOW_PUBLIC_TEST_SCHEMA=1.'
  )
  process.exit(1)
}

const client = new Client({
  connectionString: process.env.DATABASE_URL_TEST,
})

await client.connect()
await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
await client.end()

const runEnv = {
  ...createInertTestEnvironment(process.env),
  DATABASE_URL: process.env.DATABASE_URL_TEST,
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  DIRECT_URL: process.env.DATABASE_URL_TEST,
  NODE_ENV: 'test',
}

const npmExecPath = process.env.npm_execpath

const result = npmExecPath
  ? spawnSync(
      process.execPath,
      [npmExecPath, 'exec', '--', 'prisma', 'db', 'push', '--accept-data-loss'],
      {
        stdio: 'inherit',
        env: runEnv,
      }
    )
  : spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'db', 'push', '--accept-data-loss'],
      {
        stdio: 'inherit',
        env: runEnv,
      }
    )

process.exit(result.status ?? 1)

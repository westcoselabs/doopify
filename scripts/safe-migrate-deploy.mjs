import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const { Client } = pg

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required for safe migration deployment.')
const targetSchema = new URL(databaseUrl).searchParams.get('schema') || 'public'

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args
  const result = spawnSync(command, commandArgs, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed: npm ${args.join(' ')}`)
}

async function inspectTarget() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(targetSchema)}`)
    const rows = await client.query(`
      SELECT to_regclass('_prisma_migrations') AS migrations,
             to_regclass('stores') AS stores,
             to_regclass('users') AS users,
             to_regclass('sessions') AS sessions,
             to_regclass('integrations') AS integrations
    `)
    const state = rows.rows[0]
    return {
      hasMigrationHistory: Boolean(state.migrations),
      hasApplicationTables: Boolean(state.stores || state.users || state.sessions || state.integrations),
    }
  } finally {
    await client.end()
  }
}

async function migrationNames() {
  return (await readdir('prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

const target = await inspectTarget()
if (!target.hasMigrationHistory && !target.hasApplicationTables) {
  // This repository predates its checked-in migration history. An entirely
  // empty database can safely be initialized from the canonical Prisma schema,
  // then baselined so historical data migrations (including session deletion)
  // never run against the new installation.
  console.log('Bootstrapping an empty database from the canonical Prisma schema.')
  runNpm(['exec', '--', 'prisma', 'db', 'push', '--accept-data-loss'])
  for (const migration of await migrationNames()) {
    runNpm(['exec', '--', 'prisma', 'migrate', 'resolve', '--applied', migration])
  }
  console.log('Empty database bootstrapped and historical migrations baselined.')
} else {
  runNpm(['run', 'db:preflight-migrations'])
  runNpm(['exec', '--', 'prisma', 'migrate', 'deploy'])
}

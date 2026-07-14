import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

import { collectDeploymentState, evaluateMigrationDeploymentSafety } from './migration-deployment-preflight.mjs'

const { Client } = pg

loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required for safe migration deployment.')
const targetUrl = new URL(databaseUrl)
const targetSchema = targetUrl.searchParams.get('schema') || 'public'
const COMMAND_TIMEOUT_MS = Number(process.env.DOOPIFY_MIGRATION_TIMEOUT_MS || 120_000)

console.log(`Safe migration target: host=${targetUrl.hostname} port=${targetUrl.port || '5432'} database=${targetUrl.pathname.slice(1)} schema=${targetSchema}`)

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    timeout: COMMAND_TIMEOUT_MS,
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') throw new Error(`Command timed out after ${COMMAND_TIMEOUT_MS}ms: npm ${args.join(' ')}`)
    throw result.error
  }
  if (result.signal) throw new Error(`Command terminated by ${result.signal}: npm ${args.join(' ')}`)
  if (result.status !== 0) throw new Error(`Command failed: npm ${args.join(' ')}`)
}

async function inspectTarget() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(targetSchema)}`)
    return await collectDeploymentState(client)
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
if (!target.hasUserSchemaObjects) {
  // db push is permitted only after a catalog-level empty-schema check. The
  // resulting schema is explicitly baselined so historical data migrations
  // (including DELETE FROM sessions) can never run on this installation.
  console.log('Bootstrapping a genuinely empty schema from the canonical Prisma schema.')
  runNpm(['exec', '--', 'prisma', 'db', 'push', '--accept-data-loss'])
  for (const migration of await migrationNames()) {
    runNpm(['exec', '--', 'prisma', 'migrate', 'resolve', '--applied', migration])
  }
  console.log('Empty schema bootstrapped and historical migrations explicitly baselined.')
} else {
  const safety = evaluateMigrationDeploymentSafety(target)
  if (!safety.ok) {
    console.error('Safe migration deployment refused:')
    safety.failures.forEach((failure) => console.error(`- ${failure}`))
    process.exitCode = 1
  } else {
    runNpm(['exec', '--', 'prisma', 'migrate', 'deploy'])
  }
}

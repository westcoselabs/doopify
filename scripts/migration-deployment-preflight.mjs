#!/usr/bin/env node
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const { Client } = pg
const DESTRUCTIVE_SESSION_MIGRATION = '20260710_hash_persisted_sessions'
const UNSAFE_PROVIDER_SINGLETON_MIGRATION = '20260711_provider_and_store_singletons'
const SESSION_COMPATIBILITY_MIGRATION = '20260713_session_hash_compatibility'

export function evaluateMigrationDeploymentSafety(input) {
  const applied = new Set(input.appliedMigrationNames)
  const destructiveSessionMigrationApplied = applied.has(DESTRUCTIVE_SESSION_MIGRATION)
  const unsafeProviderMigrationApplied = applied.has(UNSAFE_PROVIDER_SINGLETON_MIGRATION)
  const compatibilityMigrationApplied = applied.has(SESSION_COMPATIBILITY_MIGRATION)
  const failures = []

  if (!input.migrationsTableExists && input.hasApplicationTables) {
    failures.push('Prisma migration history is missing while application tables exist; refusing to infer deployment safety.')
  }

  if (!destructiveSessionMigrationApplied && input.sessionsTableExists && input.sessionCount > 0) {
    failures.push(
      `${DESTRUCTIVE_SESSION_MIGRATION} is pending and ${input.sessionCount} persisted session(s) exist. Refusing to run its DELETE FROM sessions.`
    )
  }

  if (!unsafeProviderMigrationApplied && input.providerDuplicateCount > 0) {
    failures.push(
      `${UNSAFE_PROVIDER_SINGLETON_MIGRATION} is pending and ${input.providerDuplicateCount} duplicate built-in provider group(s) exist. It cannot create its unique index safely.`
    )
  }

  return {
    ok: failures.length === 0,
    failures,
    state: {
      destructiveSessionMigrationApplied,
      unsafeProviderMigrationApplied,
      compatibilityMigrationApplied,
      freshDatabase: !input.migrationsTableExists && !input.hasApplicationTables,
    },
  }
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`])
  return Boolean(result.rows[0]?.table_name)
}

async function collectDeploymentState(client) {
  const migrationsTableExists = await tableExists(client, '_prisma_migrations')
  const sessionsTableExists = await tableExists(client, 'sessions')
  const integrationsTableExists = await tableExists(client, 'integrations')
  const storesTableExists = await tableExists(client, 'stores')
  const appliedMigrationNames = migrationsTableExists
    ? (await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows.map((row) => row.migration_name)
    : []
  const sessionCount = sessionsTableExists ? Number((await client.query('SELECT count(*)::int AS count FROM "sessions"')).rows[0]?.count || 0) : 0
  const providerDuplicateCount = integrationsTableExists
    ? Number((await client.query(`
        SELECT count(*)::int AS count
        FROM (
          SELECT "type"
          FROM "integrations"
          WHERE "type" IN ('PAYMENT_STRIPE', 'SHIPPING_SHIPPO', 'SHIPPING_EASYPOST', 'EMAIL_RESEND', 'EMAIL_SMTP')
          GROUP BY "type"
          HAVING count(*) > 1
        ) duplicates
      `)).rows[0]?.count || 0)
    : 0

  return {
    migrationsTableExists,
    sessionsTableExists,
    sessionCount,
    providerDuplicateCount,
    hasApplicationTables: sessionsTableExists || integrationsTableExists || storesTableExists,
    appliedMigrationNames,
  }
}

async function main() {
  const connectionString = String(process.env.DATABASE_URL || '').trim()
  if (!connectionString) {
    console.error('DATABASE_URL is required for migration deployment preflight.')
    process.exitCode = 1
    return
  }

  const client = new Client({ connectionString })
  try {
    await client.connect()
    const result = evaluateMigrationDeploymentSafety(await collectDeploymentState(client))
    if (!result.ok) {
      console.error('Migration deployment preflight failed:')
      result.failures.forEach((failure) => console.error(`- ${failure}`))
      console.error('Follow docs/SESSION_TOKEN_MIGRATION_RUNBOOK.md before invoking prisma migrate deploy.')
      process.exitCode = 1
      return
    }
    console.log('Migration deployment preflight passed.')
  } finally {
    await client.end().catch(() => {})
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main().catch((error) => {
    console.error('Migration deployment preflight failed:', error instanceof Error ? error.message : 'unknown error')
    process.exitCode = 1
  })
}

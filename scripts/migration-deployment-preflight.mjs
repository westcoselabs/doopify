import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

const { Client } = pg
export const DESTRUCTIVE_SESSION_MIGRATION = '20260710_hash_persisted_sessions'
export const UNSAFE_PROVIDER_SINGLETON_MIGRATION = '20260711_provider_and_store_singletons'
export const SESSION_COMPATIBILITY_MIGRATION = '20260713_session_hash_compatibility'
export const CORRECTIVE_PROVIDER_SINGLETON_MIGRATION = '20260714_correct_provider_store_singletons'

export function evaluateMigrationDeploymentSafety(input) {
  const applied = new Set(input.appliedMigrationNames)
  const failed = new Set(input.failedMigrationNames || [])
  const destructiveSessionMigrationApplied = applied.has(DESTRUCTIVE_SESSION_MIGRATION)
  const unsafeProviderMigrationApplied = applied.has(UNSAFE_PROVIDER_SINGLETON_MIGRATION)
  const compatibilityMigrationApplied = applied.has(SESSION_COMPATIBILITY_MIGRATION)
  const failures = []

  if (input.unknownMigrationHistory) {
    failures.push('Prisma migration history has an unknown or incomplete table shape; refusing to infer deployment safety.')
  }

  // A schema which contains any user-owned object is an existing database. The
  // historical session migration must never be allowed to run there: checking
  // a session count first leaves a TOCTOU window before Prisma starts deploy.
  if (input.hasUserSchemaObjects && !destructiveSessionMigrationApplied) {
    failures.push(
      `${DESTRUCTIVE_SESSION_MIGRATION} is pending on an existing schema. Refusing to run its historical DELETE FROM sessions; resolve the reviewed migration history before deployment.`
    )
  }

  if (!input.migrationsTableExists && input.hasUserSchemaObjects) {
    failures.push('Prisma migration history is missing while user-created schema objects exist; refusing to infer deployment safety.')
  }

  if (failed.has(UNSAFE_PROVIDER_SINGLETON_MIGRATION)) {
    failures.push(
      `${UNSAFE_PROVIDER_SINGLETON_MIGRATION} previously failed. Follow docs/PROVIDER_STORE_SINGLETON_MIGRATION_RUNBOOK.md to inspect and explicitly resolve its history before deployment.`
    )
  } else if (!unsafeProviderMigrationApplied && input.hasUserSchemaObjects) {
    failures.push(
      `${UNSAFE_PROVIDER_SINGLETON_MIGRATION} is pending on an existing schema. Do not run its historical unique-index SQL; follow docs/PROVIDER_STORE_SINGLETON_MIGRATION_RUNBOOK.md.`
    )
  }

  return {
    ok: failures.length === 0,
    failures,
    state: {
      destructiveSessionMigrationApplied,
      unsafeProviderMigrationApplied,
      compatibilityMigrationApplied,
      correctiveProviderSingletonMigrationApplied: applied.has(CORRECTIVE_PROVIDER_SINGLETON_MIGRATION),
      freshDatabase: !input.hasUserSchemaObjects,
    },
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function schemaFromConnectionString(connectionString) {
  try {
    return new URL(connectionString).searchParams.get('schema') || 'public'
  } catch {
    return 'public'
  }
}

export async function collectDeploymentState(client) {
  // Do not use a shortlist of Doopify table names. PostgreSQL exposes every
  // object that could make db push --accept-data-loss destructive here.
  const objectResult = await client.query(`
    SELECT count(*)::int AS count
    FROM (
      SELECT c.oid
      FROM pg_class c
      WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      UNION ALL
      SELECT t.oid
      FROM pg_type t
      WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        AND t.typrelid = 0
        AND t.typtype IN ('b', 'c', 'd', 'e', 'm', 'r')
    ) objects
  `)
  const migrationsTableResult = await client.query("SELECT to_regclass('_prisma_migrations') AS table_name")
  const migrationsTableExists = Boolean(migrationsTableResult.rows[0]?.table_name)
  const migrationColumns = migrationsTableExists
    ? (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '_prisma_migrations'`)).rows.map((row) => row.column_name)
    : []
  const hasExpectedMigrationColumns = ['migration_name', 'finished_at', 'rolled_back_at'].every((name) => migrationColumns.includes(name))
  const migrationRows = migrationsTableExists && hasExpectedMigrationColumns
    ? (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')).rows
    : []
  const appliedMigrationNames = migrationRows
    .filter((row) => row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name)
  const failedMigrationNames = migrationRows
    .filter((row) => !row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name)

  return {
    migrationsTableExists,
    unknownMigrationHistory: migrationsTableExists && !hasExpectedMigrationColumns,
    hasUserSchemaObjects: Number(objectResult.rows[0]?.count || 0) > 0,
    userSchemaObjectCount: Number(objectResult.rows[0]?.count || 0),
    appliedMigrationNames,
    failedMigrationNames,
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
    await client.query(`SET search_path TO ${quoteIdentifier(schemaFromConnectionString(connectionString))}`)
    const result = evaluateMigrationDeploymentSafety(await collectDeploymentState(client))
    if (!result.ok) {
      console.error('Migration deployment preflight failed:')
      result.failures.forEach((failure) => console.error(`- ${failure}`))
      console.error('Do not use prisma migrate deploy directly; use the applicable migration runbook and then npm run db:deploy:safe.')
      process.exitCode = 1
      return
    }
    console.log(result.state.freshDatabase ? 'Migration deployment preflight passed for an empty schema.' : 'Migration deployment preflight passed.')
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

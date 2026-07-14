import { config as loadEnv } from 'dotenv'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
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
    const unknownNames = Array.isArray(input.unknownMigrationNames) && input.unknownMigrationNames.length
      ? ` Unknown migration names: ${input.unknownMigrationNames.join(', ')}.`
      : ''
    failures.push(`Prisma migration history has an unknown or incomplete table shape; refusing to infer deployment safety.${unknownNames}`)
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

export function validateLocalMigrationNames(names) {
  if (!names.length || names.some((name) => !/^\d{8}_[a-z0-9_]+$/i.test(name))) {
    throw new Error('Local Prisma migration directories are missing or malformed; refusing to infer deployment safety.')
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    throw new Error('Local Prisma migration directories contain duplicate names; refusing to infer deployment safety.')
  }
  return [...names].sort()
}

export async function discoverLocalMigrationNames(migrationsDirectory = path.resolve(process.cwd(), 'prisma', 'migrations')) {
  let entries
  try {
    entries = await readdir(migrationsDirectory, { withFileTypes: true })
  } catch {
    throw new Error('Unable to discover local Prisma migration directories; refusing to infer deployment safety.')
  }

  return validateLocalMigrationNames(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
}

export async function collectDeploymentState(client, { migrationsDirectory } = {}) {
  // A fresh bootstrap is safe only when the target schema contains no
  // user-created object. Keep extension-owned objects in scope too: they are
  // still target-schema state that must not be silently baselined.
  const objectResult = await client.query(`
    SELECT count(*)::int AS count
    FROM (
      SELECT c.oid
      FROM pg_class c
      WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f', 'i', 'I')
      UNION ALL
      SELECT t.oid
      FROM pg_type t
      WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        AND t.typrelid = 0
        AND t.typtype IN ('b', 'c', 'd', 'e', 'm', 'r')
      UNION ALL
      SELECT p.oid
      FROM pg_proc p
      WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT o.oid
      FROM pg_operator o
      WHERE o.oprnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT c.oid
      FROM pg_collation c
      WHERE c.collnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT e.oid
      FROM pg_extension e
      WHERE e.extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT c.oid
      FROM pg_ts_config c
      WHERE c.cfgnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT d.oid
      FROM pg_ts_dict d
      WHERE d.dictnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
      UNION ALL
      SELECT c.oid
      FROM pg_conversion c
      WHERE c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
    ) objects
  `)
  const localMigrationNames = await discoverLocalMigrationNames(migrationsDirectory)
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
  const knownMigrationNames = new Set(localMigrationNames)
  const unknownMigrationNames = migrationRows
    .map((row) => row.migration_name)
    .filter((migrationName) => !knownMigrationNames.has(migrationName))

  return {
    migrationsTableExists,
    unknownMigrationHistory: (migrationsTableExists && !hasExpectedMigrationColumns) || unknownMigrationNames.length > 0,
    unknownMigrationNames,
    localMigrationNames,
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

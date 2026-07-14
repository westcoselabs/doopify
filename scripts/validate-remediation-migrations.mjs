import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

import { createInertTestEnvironment } from './test-environment.mjs'
import { targetsMatch } from './test-database-safety.mjs'

const { Client } = pg
const DEFAULT_COMMAND_TIMEOUT_MS = 600_000
const configuredTimeout = Number(process.env.DOOPIFY_MIGRATION_VALIDATION_TIMEOUT_MS || DEFAULT_COMMAND_TIMEOUT_MS)
const COMMAND_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout >= 60_000
  ? configuredTimeout
  : DEFAULT_COMMAND_TIMEOUT_MS

loadEnv({ path: '.env', quiet: true })
loadEnv({ path: '.env.local', override: true, quiet: true })

const testUrl = String(process.env.DATABASE_URL_TEST || '').trim()
const e2eUrl = String(process.env.E2E_DATABASE_URL || '').trim()
if (!testUrl || !e2eUrl) throw new Error('DATABASE_URL_TEST and E2E_DATABASE_URL are required for migration validation.')
const testTarget = new URL(testUrl)
const e2eTarget = new URL(e2eUrl)
const normalize = (url) => ({ protocol: url.protocol, hostname: url.hostname.toLowerCase(), port: url.port || '5432', username: decodeURIComponent(url.username), database: decodeURIComponent(url.pathname.slice(1)), schema: url.searchParams.get('schema') || 'public' })
if (!targetsMatch(normalize(testTarget), normalize(e2eTarget))) throw new Error('DATABASE_URL_TEST and E2E_DATABASE_URL must identify the same disposable target.')
if (process.env.DATABASE_URL && targetsMatch(normalize(testTarget), normalize(new URL(process.env.DATABASE_URL)))) throw new Error('DATABASE_URL_TEST must not match DATABASE_URL.')

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function temporarySchemaName() {
  return `doopify_migration_validation_${randomBytes(6).toString('hex')}`
}

function schemaUrl(schema) {
  const url = new URL(testUrl)
  url.searchParams.set('schema', schema)
  return url.toString()
}

function childEnvironment(databaseUrl) {
  return createInertTestEnvironment(process.env, {
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: testUrl,
    DIRECT_URL: databaseUrl,
    NODE_ENV: 'test',
    DOOPIFY_MIGRATION_TIMEOUT_MS: String(COMMAND_TIMEOUT_MS),
  })
}

function terminateProcessTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGKILL')
  } catch {}
}

function npmInvocation(args, databaseUrl, allowFailure = false, scenario = 'migration validation') {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: childEnvironment(databaseUrl),
    stdio: 'inherit',
    timeout: COMMAND_TIMEOUT_MS + 10_000,
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      terminateProcessTree(result.pid)
      throw new Error(`${scenario}: timed out after ${COMMAND_TIMEOUT_MS}ms while running npm ${args.join(' ')}`)
    }
    throw result.error
  }
  if (result.signal) throw new Error(`Command terminated by ${result.signal}: npm ${args.join(' ')}`)
  if (!allowFailure && result.status !== 0) throw new Error(`Command failed: npm ${args.join(' ')}`)
  return result.status ?? 1
}

function runSafeDeploy(databaseUrl, allowFailure = false, scenario) {
  return npmInvocation(['run', 'db:deploy:safe'], databaseUrl, allowFailure, scenario)
}

function runMigrationResolve(databaseUrl, status, migration, scenario) {
  return npmInvocation(['exec', '--', 'prisma', 'migrate', 'resolve', `--${status}`, migration], databaseUrl, false, scenario)
}

function runSafeDeployConcurrentWithSession(databaseUrl, insertSession) {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = npmExecPath ? [npmExecPath, 'run', 'db:deploy:safe'] : ['run', 'db:deploy:safe']
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: childEnvironment(databaseUrl),
      stdio: 'inherit',
    })
    const timer = setTimeout(() => {
      terminateProcessTree(child.pid)
      reject(new Error('safe migration deployment timed out during session-race regression.'))
    }, COMMAND_TIMEOUT_MS + 10_000)
    void (async () => {
      try {
        // This insertion happens while the supported wrapper is running. The
        // new unconditional existing-schema refusal makes the old TOCTOU path
        // impossible regardless of whether it lands before or after preflight.
        await insertSession()
      } catch (error) {
        terminateProcessTree(child.pid)
        clearTimeout(timer)
        reject(error)
      }
    })()
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (signal) reject(new Error(`safe migration deployment terminated by ${signal}`))
      else resolve(code ?? 1)
    })
  })
}

async function withTemporarySchema(callback) {
  const schema = temporarySchemaName()
  const admin = new Client({ connectionString: testUrl })
  await admin.connect()
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`)
    await admin.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`)
    await callback({ schema, databaseUrl: schemaUrl(schema) })
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`)
    await admin.end()
  }
}

async function runScenario(label, callback) {
  const startedAt = Date.now()
  console.log(`Migration validation: starting ${label}.`)
  await callback()
  console.log(`Migration validation: completed ${label} in ${Date.now() - startedAt}ms.`)
}

async function withSchemaClient(databaseUrl, schema, callback) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}`)
    return await callback(client)
  } finally {
    await client.end()
  }
}

async function assertRefusesAndPreserves(label, setup, verify) {
  await withTemporarySchema(async ({ schema, databaseUrl }) => {
    await withSchemaClient(databaseUrl, schema, setup)
    assert.notEqual(runSafeDeploy(databaseUrl, true, label), 0, `${label} must be rejected by the actual safe deploy command`)
    await withSchemaClient(databaseUrl, schema, verify)
  })
}

async function validateSchemaEmptiness() {
  await assertRefusesAndPreserves(
    'function-only schema',
    (client) => client.query("CREATE FUNCTION preserved_function() RETURNS integer LANGUAGE SQL IMMUTABLE AS 'SELECT 1'"),
    async (client) => assert.equal((await client.query("SELECT to_regprocedure('preserved_function()') AS name")).rows[0].name, 'preserved_function()')
  )
  await assertRefusesAndPreserves(
    'procedure-only schema',
    (client) => client.query("CREATE PROCEDURE preserved_procedure() LANGUAGE SQL AS 'SELECT 1'"),
    async (client) => assert.equal((await client.query("SELECT to_regprocedure('preserved_procedure()') AS name")).rows[0].name, 'preserved_procedure()')
  )
  await assertRefusesAndPreserves(
    'custom operator',
    async (client) => {
      await client.query("CREATE FUNCTION preserved_operator_function(integer, integer) RETURNS boolean LANGUAGE SQL IMMUTABLE AS 'SELECT $1 = $2'")
      await client.query('CREATE OPERATOR === (LEFTARG = integer, RIGHTARG = integer, PROCEDURE = preserved_operator_function)')
    },
    async (client) => assert.equal((await client.query("SELECT to_regoperator('===(integer,integer)') AS name")).rows[0].name, '===(integer,integer)')
  )
  await assertRefusesAndPreserves(
    'custom collation',
    (client) => client.query("CREATE COLLATION preserved_collation (provider = icu, locale = 'und')"),
    async (client) => assert.equal((await client.query("SELECT to_regcollation('preserved_collation') AS name")).rows[0].name, 'preserved_collation')
  )
  await assertRefusesAndPreserves(
    'other schema-owned object',
    (client) => client.query('CREATE TEXT SEARCH CONFIGURATION preserved_search_configuration (COPY = pg_catalog.simple)'),
    async (client) => assert.equal((await client.query("SELECT cfgname FROM pg_ts_config WHERE cfgnamespace = current_schema()::regnamespace AND cfgname = 'preserved_search_configuration'")).rows[0].cfgname, 'preserved_search_configuration')
  )
  await assertRefusesAndPreserves(
    'extension-owned target-schema object',
    async (client) => {
      const schema = (await client.query('SELECT current_schema() AS schema')).rows[0].schema
      await client.query(`CREATE EXTENSION hstore WITH SCHEMA ${quoteIdentifier(schema)}`)
    },
    async (client) => assert.equal((await client.query("SELECT extname FROM pg_extension WHERE extname = 'hstore' AND extnamespace = current_schema()::regnamespace")).rows[0].extname, 'hstore')
  )
  await assertRefusesAndPreserves(
    'unrelated table',
    (client) => client.query('CREATE TABLE unrelated_preserved (id integer PRIMARY KEY)'),
    async (client) => assert.equal((await client.query("SELECT to_regclass('unrelated_preserved') AS name")).rows[0].name, 'unrelated_preserved')
  )
  await assertRefusesAndPreserves(
    'unrelated enum',
    (client) => client.query("CREATE TYPE unrelated_state AS ENUM ('safe')"),
    async (client) => assert.equal((await client.query("SELECT to_regtype('unrelated_state') AS name")).rows[0].name, 'unrelated_state')
  )
  await assertRefusesAndPreserves(
    'partial Doopify schema',
    (client) => client.query('CREATE TABLE stores (id text PRIMARY KEY, name text NOT NULL)'),
    async (client) => assert.equal((await client.query("SELECT to_regclass('stores') AS name")).rows[0].name, 'stores')
  )
  await assertRefusesAndPreserves(
    'incomplete migration history',
    async (client) => {
      await client.query('CREATE TABLE "_prisma_migrations" (migration_name text PRIMARY KEY, finished_at timestamptz)')
      await client.query("INSERT INTO \"_prisma_migrations\" (migration_name, finished_at) VALUES ('unknown_history', now())")
    },
    async (client) => assert.equal((await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations"')).rows[0].count, 1)
  )

  for (const [label, finishedAt, rolledBackAt] of [
    ['unknown applied migration', 'now()', 'NULL'],
    ['unknown failed migration', 'NULL', 'NULL'],
    ['unknown rolled-back migration', 'now()', 'now()'],
  ]) {
    await assertRefusesAndPreserves(
      label,
      async (client) => {
        await client.query('CREATE TABLE "_prisma_migrations" (migration_name text PRIMARY KEY, finished_at timestamptz, rolled_back_at timestamptz)')
        await client.query(`INSERT INTO "_prisma_migrations" (migration_name, finished_at, rolled_back_at) VALUES ('20260710_hash_persisted_sessions', now(), NULL), ('20260711_provider_and_store_singletons', now(), NULL), ('20990101_unknown_${label.replaceAll(' ', '_')}', ${finishedAt}, ${rolledBackAt})`)
      },
      async (client) => assert.equal((await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations"')).rows[0].count, 3)
    )
  }
}

async function validateActualDeploymentAndHistories() {
  await withTemporarySchema(async ({ schema, databaseUrl }) => {
    // Truly empty schema: the only allowed db push/baseline path.
    assert.equal(runSafeDeploy(databaseUrl), 0)
    await withSchemaClient(databaseUrl, schema, async (client) => {
      const migrations = await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
      const tables = await client.query("SELECT to_regclass('stores') AS stores, to_regclass('integrations') AS integrations, to_regclass('sessions') AS sessions")
      assert.ok(migrations.rows[0].count > 0, 'fresh schema must record explicitly baselined migrations')
      assert.deepEqual(tables.rows[0], { stores: 'stores', integrations: 'integrations', sessions: 'sessions' })
    })

    // Existing history with the destructive session migration made pending.
    await withSchemaClient(databaseUrl, schema, async (client) => {
      await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = $1', ['20260710_hash_persisted_sessions'])
      await client.query(`INSERT INTO "users" ("id", "email", "passwordHash", "role", "isActive", "updatedAt") VALUES ('session-race-user', 'session-race@example.com', 'not-a-secret', 'OWNER', true, now())`)
    })
    const raceStatus = await runSafeDeployConcurrentWithSession(databaseUrl, async () => {
      await withSchemaClient(databaseUrl, schema, (client) => client.query(`INSERT INTO "sessions" ("id", "tokenHash", "token", "userId", "expiresAt") VALUES ('session-race-session', repeat('a', 64), 'legacy-test-token', 'session-race-user', now() + interval '1 day')`))
    })
    assert.notEqual(raceStatus, 0, 'pending destructive session history must refuse the actual wrapper')
    await withSchemaClient(databaseUrl, schema, async (client) => {
      assert.equal((await client.query("SELECT count(*)::int AS count FROM \"sessions\" WHERE \"id\" = 'session-race-session'")).rows[0].count, 1, 'a session created during the former race survives')
      assert.equal((await client.query("SELECT count(*)::int AS count FROM \"_prisma_migrations\" WHERE migration_name = '20260710_hash_persisted_sessions' AND finished_at IS NOT NULL")).rows[0].count, 0)
    })

    // Operator-reviewed recovery restores only migration history, never deleted
    // session data, then lets the safe wrapper continue.
    runMigrationResolve(databaseUrl, 'applied', '20260710_hash_persisted_sessions')

    // Pending unsafe singleton predecessor with duplicates: wrapper fails. The
    // documented resolve path then applies the corrective migration itself.
    await withSchemaClient(databaseUrl, schema, async (client) => {
      await client.query('DROP INDEX IF EXISTS "integrations_providerKey_key"')
      await client.query('DROP INDEX IF EXISTS "stores_singletonKey_key"')
      await client.query('UPDATE "integrations" SET "providerKey" = NULL')
      await client.query('UPDATE "stores" SET "singletonKey" = NULL')
      await client.query(`INSERT INTO "stores" ("id", "name", "createdAt", "updatedAt") VALUES ('store-old', 'Old store', now() - interval '2 days', now()), ('store-new', 'New store', now() - interval '1 day', now())`)
      await client.query(`INSERT INTO "integrations" ("id", "name", "type", "status", "createdAt", "updatedAt") VALUES ('stripe-old', 'Stripe old', 'PAYMENT_STRIPE', 'ACTIVE', now() - interval '2 days', now()), ('stripe-new', 'Stripe new', 'PAYMENT_STRIPE', 'ACTIVE', now() - interval '1 day', now()), ('shippo-old', 'Shippo old', 'SHIPPING_SHIPPO', 'ACTIVE', now() - interval '2 days', now()), ('shippo-new', 'Shippo new', 'SHIPPING_SHIPPO', 'ACTIVE', now() - interval '1 day', now()), ('easypost-old', 'EasyPost old', 'SHIPPING_EASYPOST', 'ACTIVE', now() - interval '2 days', now()), ('easypost-new', 'EasyPost new', 'SHIPPING_EASYPOST', 'ACTIVE', now() - interval '1 day', now())`)
      await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name IN ($1, $2)', ['20260711_provider_and_store_singletons', '20260714_correct_provider_store_singletons'])
    })
    assert.notEqual(runSafeDeploy(databaseUrl, true), 0, 'pending 20260711 with duplicates must refuse the actual wrapper')
    runMigrationResolve(databaseUrl, 'applied', '20260711_provider_and_store_singletons')
    assert.equal(runSafeDeploy(databaseUrl), 0, 'documented operator path must apply the corrective migration through safe deploy')
    await withSchemaClient(databaseUrl, schema, async (client) => {
      const providers = await client.query(`SELECT "type", "id", "providerKey", "status" FROM "integrations" WHERE "type" IN ('PAYMENT_STRIPE', 'SHIPPING_SHIPPO', 'SHIPPING_EASYPOST') ORDER BY "type", "id"`)
      assert.equal(providers.rows.filter((row) => row.providerKey).length, 3, 'one canonical row per provider must remain')
      assert.ok(providers.rows.filter((row) => !row.providerKey).every((row) => row.status === 'INACTIVE'), 'duplicates must be preserved but inactive')
      const stores = await client.query('SELECT "id", "singletonKey" FROM "stores" ORDER BY "id"')
      assert.equal(stores.rows.filter((row) => row.singletonKey === 'PRIMARY').length, 1, 'one canonical primary Store must remain')
      const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('integrations_providerKey_key', 'stores_singletonKey_key')")
      assert.equal(indexes.rowCount, 2, 'corrective migration must create both unique indexes')
      const histories = await client.query("SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name IN ('20260711_provider_and_store_singletons', '20260714_correct_provider_store_singletons') AND finished_at IS NOT NULL ORDER BY migration_name")
      assert.deepEqual(histories.rows.map((row) => row.migration_name), ['20260711_provider_and_store_singletons', '20260714_correct_provider_store_singletons'])
    })
    assert.equal(runSafeDeploy(databaseUrl), 0, 'fully corrected history must be accepted by the actual safe deploy command')

    // A failed predecessor is a distinct operational state. Recreate it with
    // duplicate data, prove the wrapper refuses it, then exercise the exact
    // reviewed rolled-back -> applied -> safe-deploy recovery sequence.
    await withSchemaClient(databaseUrl, schema, async (client) => {
      await client.query('DROP INDEX IF EXISTS "integrations_providerKey_key"')
      await client.query('UPDATE "integrations" SET "providerKey" = NULL WHERE "type" = \'SHIPPING_SHIPPO\'')
      await client.query(`INSERT INTO "integrations" ("id", "name", "type", "status", "createdAt", "updatedAt") VALUES ('shippo-failed-history-duplicate', 'Shippo failed-history duplicate', 'SHIPPING_SHIPPO', 'ACTIVE', now(), now())`)
      await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = $1', ['20260714_correct_provider_store_singletons'])
      await client.query('UPDATE "_prisma_migrations" SET finished_at = NULL, rolled_back_at = NULL WHERE migration_name = $1', ['20260711_provider_and_store_singletons'])
    })
    assert.notEqual(runSafeDeploy(databaseUrl, true), 0, 'failed 20260711 history must refuse the actual wrapper')
    runMigrationResolve(databaseUrl, 'rolled-back', '20260711_provider_and_store_singletons')
    runMigrationResolve(databaseUrl, 'applied', '20260711_provider_and_store_singletons')
    assert.equal(runSafeDeploy(databaseUrl), 0, 'failed singleton history must recover through the documented operator path')
    await withSchemaClient(databaseUrl, schema, async (client) => {
      const rows = await client.query('SELECT count(*)::int AS count FROM "integrations" WHERE "type" = \'SHIPPING_SHIPPO\' AND "providerKey" = \'SHIPPO\'')
      assert.equal(rows.rows[0].count, 1, 'failed-history remediation must leave one Shippo canonical key')
    })
  })
}

console.log(`Starting real PostgreSQL remediation migration validation (temporary schemas only; timeout ${COMMAND_TIMEOUT_MS}ms).`)
await runScenario('schema-emptiness and unknown-history refusal', validateSchemaEmptiness)
await runScenario('empty bootstrap, session race, and singleton remediation', validateActualDeploymentAndHistories)
console.log('Remediation migration validation passed: empty, catalog-object/unknown-history refusal, session race, singleton remediation, and corrected history.')

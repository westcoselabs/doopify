import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const { Client } = pg

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const testUrl = String(process.env.DATABASE_URL_TEST || '').trim()
if (!testUrl) throw new Error('DATABASE_URL_TEST is required for migration validation.')
if (testUrl === process.env.DATABASE_URL) throw new Error('DATABASE_URL_TEST must not match DATABASE_URL.')

const configuredSchema = new URL(testUrl).searchParams.get('schema') || 'public'
if (configuredSchema === 'public') throw new Error('Migration validation requires a dedicated non-public test schema.')

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

function runSafeDeploy(databaseUrl) {
  const npmExecPath = process.env.npm_execpath
  const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = npmExecPath ? [npmExecPath, 'run', 'db:deploy:safe'] : ['run', 'db:deploy:safe']
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('safe migration deployment failed.')
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

async function validateFreshMigration() {
  await withTemporarySchema(async ({ schema, databaseUrl }) => {
    runSafeDeploy(databaseUrl)
    await withSchemaClient(databaseUrl, schema, async (client) => {
      const migrations = await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
      const tables = await client.query("SELECT to_regclass('stores') AS stores, to_regclass('integrations') AS integrations, to_regclass('sessions') AS sessions")
      assert.ok(migrations.rows[0].count > 0, 'fresh schema must record applied migrations')
      assert.deepEqual(tables.rows[0], { stores: 'stores', integrations: 'integrations', sessions: 'sessions' })
    })
  })
}

async function validateDuplicateCanonicalization() {
  await withTemporarySchema(async ({ schema, databaseUrl }) => {
    runSafeDeploy(databaseUrl)
    const correctiveSql = await readFile('prisma/migrations/20260714_correct_provider_store_singletons/migration.sql', 'utf8')

    await withSchemaClient(databaseUrl, schema, async (client) => {
      await client.query('DROP INDEX IF EXISTS "integrations_providerKey_key"')
      await client.query('DROP INDEX IF EXISTS "stores_singletonKey_key"')
      await client.query('UPDATE "integrations" SET "providerKey" = NULL')
      await client.query('UPDATE "stores" SET "singletonKey" = NULL')

      await client.query(`
        INSERT INTO "stores" ("id", "name", "createdAt", "updatedAt") VALUES
          ('store-old', 'Old store', now() - interval '2 days', now()),
          ('store-new', 'New store', now() - interval '1 day', now())
      `)
      await client.query(`
        INSERT INTO "integrations" ("id", "name", "type", "status", "createdAt", "updatedAt") VALUES
          ('stripe-canonical', 'Stripe canonical', 'PAYMENT_STRIPE', 'ACTIVE', now() - interval '2 days', now() - interval '1 day'),
          ('stripe-newer', 'Stripe incomplete', 'PAYMENT_STRIPE', 'ACTIVE', now() - interval '1 day', now()),
          ('shippo-canonical', 'Shippo canonical', 'SHIPPING_SHIPPO', 'ACTIVE', now() - interval '2 days', now() - interval '1 day'),
          ('shippo-legacy', 'Shippo legacy', 'SHIPPING_SHIPPO', 'INACTIVE', now() - interval '1 day', now()),
          ('easypost-canonical', 'EasyPost canonical', 'SHIPPING_EASYPOST', 'ACTIVE', now() - interval '2 days', now() - interval '1 day'),
          ('easypost-newer', 'EasyPost incomplete', 'SHIPPING_EASYPOST', 'ACTIVE', now() - interval '1 day', now())
      `)
      await client.query(`
        INSERT INTO "integration_secrets" ("id", "integrationId", "key", "value") VALUES
          ('stripe-pk', 'stripe-canonical', 'PUBLISHABLE_KEY', 'redacted'),
          ('stripe-sk', 'stripe-canonical', 'SECRET_KEY', 'redacted'),
          ('stripe-verified', 'stripe-canonical', 'META_LAST_VERIFIED_AT', 'redacted'),
          ('shippo-key', 'shippo-canonical', 'API_KEY', 'redacted'),
          ('easypost-key', 'easypost-canonical', 'API_KEY', 'redacted')
      `)

      await client.query(`BEGIN;\n${correctiveSql}\nCOMMIT;`)

      const providers = await client.query(`
        SELECT "type", "id", "providerKey", "status"
        FROM "integrations"
        WHERE "type" IN ('PAYMENT_STRIPE', 'SHIPPING_SHIPPO', 'SHIPPING_EASYPOST')
        ORDER BY "type", "id"
      `)
      const canonical = new Map(providers.rows.filter((row) => row.providerKey).map((row) => [row.type, row.id]))
      assert.deepEqual(Object.fromEntries(canonical), {
        PAYMENT_STRIPE: 'stripe-canonical',
        SHIPPING_SHIPPO: 'shippo-canonical',
        SHIPPING_EASYPOST: 'easypost-canonical',
      })
      assert.ok(providers.rows.filter((row) => !row.providerKey).every((row) => row.status === 'INACTIVE'))

      const stores = await client.query('SELECT "id", "singletonKey" FROM "stores" ORDER BY "id"')
      assert.equal(stores.rows.filter((row) => row.singletonKey === 'PRIMARY').length, 1)
      assert.equal(stores.rows.find((row) => row.singletonKey === 'PRIMARY')?.id, 'store-old')

      const indexes = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ('integrations_providerKey_key', 'stores_singletonKey_key')
      `)
      assert.equal(indexes.rowCount, 2, 'corrective migration must recreate singleton unique indexes')
    })
  })
}

await validateFreshMigration()
await validateDuplicateCanonicalization()
console.log('Remediation migration validation passed (fresh schema and duplicate provider/store scenarios).')

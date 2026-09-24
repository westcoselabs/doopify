import assert from 'node:assert/strict'
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { parse } from 'dotenv'
import pg from 'pg'
import { buildMigrationExport, contractLegacyConfiguration, inspectMigrationTarget, parseDestinations, readLegacyState, serializeDestinations, serializeEnvironment, verifyMigration, writeExclusiveExports } from './env-only-migration.mjs'

const url = new URL(process.env.MIGRATION_REHEARSAL_DATABASE_URL || '')
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/doopify_test') throw new Error('Rehearsal is restricted to the disposable loopback doopify_test database on port55432.')
const suffix = randomBytes(6).toString('hex')
const sourceSchema = `doopify_env_source_${suffix}`, restoredSchema = `doopify_env_restore_${suffix}`
const quote = (name) => `"${name.replaceAll('"', '""')}"`
const client = new pg.Client({ connectionString: url.toString() })
const directory = await mkdtemp(path.join(os.tmpdir(), 'doopify-env-rehearsal-'))
const backup = path.join(directory, 'fixture.sql'), envFile = path.join(directory, '.env'), destinationsFile = path.join(directory, 'outbound-webhooks.ts')
const key = randomBytes(48).toString('base64url'), previous = randomBytes(48).toString('base64url')
let phase = 'create synthetic legacy fixture'
function encrypt(text, encryptionKey = key) {
  const iv = randomBytes(16), salt = randomBytes(64), cipher = createCipheriv('aes-256-gcm', scryptSync(encryptionKey, salt, 32), iv)
  const body = cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
  return `v1:${iv.toString('hex')}:${salt.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body}`
}
try {
  await client.connect()
  await client.query(`CREATE SCHEMA ${quote(sourceSchema)}`)
  await client.query(`SET search_path TO ${quote(sourceSchema)}`)
  await client.query(`
    CREATE TABLE "_prisma_migrations" (migration_name text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz);
    CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
    CREATE TABLE integrations (id text PRIMARY KEY, "providerKey" text, name text, type text, "webhookUrl" text, "webhookSecret" text, status "IntegrationStatus", "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
    CREATE TABLE integration_secrets (id text PRIMARY KEY, "integrationId" text REFERENCES integrations(id), key text, value text);
    CREATE TABLE integration_events (id text PRIMARY KEY, "integrationId" text REFERENCES integrations(id), event text);
    CREATE TABLE stores (id text PRIMARY KEY, "singletonKey" text, name text, "shippingLiveProvider" text, "shippingProviderUsage" text, "activeRateProvider" text, "labelProvider" text);
    CREATE TABLE users (id text PRIMARY KEY, "mfaTotpSecretEnc" text, "mfaTotpPendingSecretEnc" text);
    CREATE TABLE digital_download_deliveries (id text PRIMARY KEY, "tokenEnc" text);
    CREATE TABLE jobs (id text PRIMARY KEY, status text);
    CREATE TABLE webhook_deliveries (id text PRIMARY KEY, status text);
    CREATE TABLE email_deliveries (id text PRIMARY KEY, status text);
    CREATE TABLE outbound_webhook_deliveries (id text PRIMARY KEY, "integrationId" text, status text, payload text, CONSTRAINT "outbound_webhook_deliveries_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES integrations(id));
    CREATE TABLE orders (id text PRIMARY KEY, "paymentIntentId" text, "totalCents" integer);
  `)
  const { discoverLocalMigrationNames } = await import('./migration-deployment-preflight.mjs')
  const migrations = await discoverLocalMigrationNames()
  for (const migration of migrations.filter((name) => name !== '20260924_env_only_delivery_leases')) await client.query('INSERT INTO "_prisma_migrations" VALUES ($1, now(), NULL)', [migration])
  await client.query(`INSERT INTO stores VALUES ('store', 'PRIMARY', 'Preserved store', 'SHIPPO', 'LABELS_ONLY', 'EASYPOST', 'NONE'); INSERT INTO integrations (id, "providerKey", name, type, status) VALUES ('stripe', 'STRIPE', 'Stripe', 'PAYMENT_STRIPE', 'ACTIVE')`)
  await client.query(`INSERT INTO integrations (id, name, type, status, "webhookUrl", "webhookSecret") VALUES ('existing-endpoint', 'Merchant endpoint', 'CUSTOM', 'ACTIVE', 'https://merchant.example.test/events', $1)`, [encrypt('preserved-signing-key')])
  for (const [name, value] of Object.entries({ SECRET_KEY: 'sk_test_database_fixture', PUBLISHABLE_KEY: 'pk_test_database_fixture', META_LAST_VERIFIED_AT: 'verified' })) await client.query('INSERT INTO integration_secrets VALUES ($1, $2, $3, $4)', [`stripe-${name}`, 'stripe', name, encrypt(value)])
  await client.query(`INSERT INTO integration_secrets VALUES ('header', 'existing-endpoint', 'HEADER_Authorization', $1)`, [encrypt('Bearer preserved-header')])
  await client.query(`INSERT INTO integration_events VALUES ('event', 'existing-endpoint', 'order.paid'); INSERT INTO jobs VALUES ('job', 'PENDING'); INSERT INTO webhook_deliveries VALUES ('inbound', 'PROCESSED'); INSERT INTO email_deliveries VALUES ('email', 'SENT'); INSERT INTO outbound_webhook_deliveries VALUES ('existing-delivery', 'existing-endpoint', 'SUCCESS', '{"original":true}'); INSERT INTO orders VALUES ('existing-order', 'pi_verified_fixture', 12345)`)
  const mfa = encrypt('preserved-totp', previous), token = encrypt('preserved-download-token')
  await client.query('INSERT INTO users VALUES ($1, $2, NULL)', ['owner', mfa])
  await client.query('INSERT INTO digital_download_deliveries VALUES ($1, $2)', ['download', token])
  phase = 'back up and restore synthetic fixture'
  await writeExclusiveExports([[backup, '']])
  const dump = spawnSync(process.env.PG_DUMP_PATH || 'pg_dump', ['--host=127.0.0.1', '--port=55432', '--username=doopify_test', '--dbname=doopify_test', `--schema=${sourceSchema}`, '--no-owner', '--no-acl', '--inserts', `--file=${backup}`], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (dump.status !== 0) throw new Error('Synthetic fixture backup failed.')
  // Restore only into a fresh, generated schema on the explicitly guarded cluster.
  let restoreSql = (await readFile(backup, 'utf8')).replaceAll(sourceSchema, restoredSchema)
  restoreSql = restoreSql.split('\n').filter((line) => !line.startsWith('\\')).join('\n')
  await client.query(restoreSql)
  await client.query(`SET search_path TO ${quote(restoredSchema)}`)
  await inspectMigrationTarget(client)
  const restoredUrl = new URL(url); restoredUrl.searchParams.set('schema', restoredSchema)
  const environment = { DATABASE_URL: restoredUrl.toString(), JWT_SECRET: 'migration-rehearsal-authentication-only', ENCRYPTION_KEY: ` ${key} `, ENCRYPTION_KEY_PREVIOUS: ` ${previous} `, STRIPE_SECRET_KEY: 'sk_test_environment_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_environment_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }
  const state = await readLegacyState(client), plan = buildMigrationExport(state, environment)
  assert.equal(plan.values.STRIPE_SECRET_KEY, 'sk_test_database_fixture')
  assert.equal(plan.values.SHIPPING_RATE_PROVIDER, 'easypost')
  assert.equal(plan.values.SHIPPING_LABEL_PROVIDER, 'shippo')
  phase = 'export and apply additive migration'
  await writeExclusiveExports([[envFile, serializeEnvironment(plan.values)], [destinationsFile, serializeDestinations(plan.destinations)]])
  const targetEnvironment = parse(await readFile(envFile)), destinations = parseDestinations(await readFile(destinationsFile, 'utf8'))
  await client.query(await readFile('prisma/migrations/20260924_env_only_delivery_leases/migration.sql', 'utf8'))
  await client.query('INSERT INTO "_prisma_migrations" VALUES ($1, now(), NULL)', ['20260924_env_only_delivery_leases'])
  phase = 'verify and contract restored fixture'
  const verification = await verifyMigration(client, plan, targetEnvironment, destinations)
  const contract = { legacyEnvironment: environment, targetEnvironment, destinations, maintenanceWindow: true, backupConfirmed: true, cutoverVerified: true, confirmContract: true }
  await assert.rejects(contractLegacyConfiguration(client, contract), /not drained/)
  assert.equal((await client.query("SELECT to_regclass('integrations') IS NOT NULL AS exists")).rows[0].exists, true)
  await client.query("UPDATE jobs SET status = 'SUCCESS'")
  const contracted = await contractLegacyConfiguration(client, contract)
  const after = (await client.query('SELECT "mfaTotpSecretEnc" FROM users WHERE id = $1', ['owner'])).rows[0]
  assert.equal(after.mfaTotpSecretEnc, mfa)
  assert.equal((await client.query('SELECT "tokenEnc" FROM digital_download_deliveries')).rows[0].tokenEnc, token)
  assert.equal((await client.query('SELECT id, payload, "destinationUrl" FROM outbound_webhook_deliveries')).rows[0].id, 'existing-delivery')
  assert.equal((await client.query('SELECT id, payload, "destinationUrl" FROM outbound_webhook_deliveries')).rows[0].payload, '{"original":true}')
  assert.equal((await client.query('SELECT "totalCents" FROM orders')).rows[0].totalCents, 12345)
  assert.equal((await client.query('SELECT name FROM stores')).rows[0].name, 'Preserved store')
  const report = { capturedAt: new Date().toISOString(), target: 'Disposable local PostgreSQL16, port55432; fresh synthetic source and pg_dump-restored schemas', verification, contracted, backupRestored: true, undrainedContractRefused: true, encryptedMfaAndDownloadEnvelopesUnchanged: true, outboundDeliveryIdAndPayloadPreserved: true, commerceAndStoreRowsPreserved: true, liveProviderCalls: 0 }
  await writeFile('docs/performance/env-only-migration-rehearsal.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} catch (error) {
  console.error(`Isolated migration rehearsal failed during ${phase}; code=${/^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'CHECK_FAILED'}. No credential material is logged.`)
  process.exitCode = 1
} finally {
  for (const schema of [restoredSchema, sourceSchema]) {
    if (!/^doopify_env_(source|restore)_[a-f0-9]{12}$/.test(schema)) throw new Error('Unexpected rehearsal schema.')
    await client.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`).catch(() => {})
  }
  await client.end().catch(() => {})
  for (const filename of [backup, envFile, destinationsFile]) await unlink(filename).catch(() => {})
  await rmdir(directory)
}

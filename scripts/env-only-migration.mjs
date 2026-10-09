import { createDecipheriv, createHash, scryptSync } from 'node:crypto'
import { open, readFile, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parse } from 'dotenv'
import pg from 'pg'
import ts from 'typescript'
import { parseEnvironment } from '../src/lib/env-schema.ts'

// Offline migration tooling only. Application code never imports this legacy reader.
const EXPAND_MIGRATION = '20260924_env_only_delivery_leases'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const quote = (value) => `"${value.replaceAll('"', '""')}"`
const trim = (value) => typeof value === 'string' ? value.trim() : ''
const realCredential = (value) => Boolean(trim(value)) && !/replace_me|replace-with|replace_with|example_key|example_secret/i.test(value)
export class MigrationError extends Error {}
const fail = (message) => { throw new MigrationError(message) }

const providers = {
  STRIPE: { type: 'PAYMENT_STRIPE', required: ['PUBLISHABLE_KEY', 'SECRET_KEY'], keys: { PUBLISHABLE_KEY: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', SECRET_KEY: 'STRIPE_SECRET_KEY', WEBHOOK_SECRET: 'STRIPE_WEBHOOK_SECRET' } },
  RESEND: { type: 'EMAIL_RESEND', required: ['API_KEY'], keys: { API_KEY: 'RESEND_API_KEY' } },
  SMTP: { type: 'EMAIL_SMTP', required: ['HOST', 'PORT', 'USERNAME', 'PASSWORD'], keys: { HOST: 'SMTP_HOST', PORT: 'SMTP_PORT', SECURE: 'SMTP_SECURE', USERNAME: 'SMTP_USERNAME', PASSWORD: 'SMTP_PASSWORD', FROM_EMAIL: 'SMTP_FROM_EMAIL' } },
  SHIPPO: { type: 'SHIPPING_SHIPPO', required: ['API_KEY'], keys: { API_KEY: 'SHIPPO_API_KEY' } },
  EASYPOST: { type: 'SHIPPING_EASYPOST', required: ['API_KEY'], keys: { API_KEY: 'EASYPOST_API_KEY' } },
}
const passthrough = ['DATABASE_URL', 'JWT_SECRET', 'SESSION_LEGACY_TOKEN_CUTOFF', 'RESEND_WEBHOOK_SECRET', 'SHIPPO_WEBHOOK_SECRET', 'EASYPOST_WEBHOOK_SECRET', 'MEDIA_STORAGE_PROVIDER', 'MEDIA_S3_REGION', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ENDPOINT', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL', 'DIGITAL_ASSET_LOCAL_DIR', 'BLOB_READ_WRITE_TOKEN', 'NEXT_PUBLIC_STORE_URL', 'WEBHOOK_RETRY_SECRET', 'JOB_RUNNER_SECRET', 'ABANDONED_CHECKOUT_SECRET', 'SETUP_TOKEN', 'OWNER_MFA_GRACE_PERIOD_DAYS']

function encryptionKeys(environment, renamed = false) {
  const current = trim(environment[renamed ? 'DATA_ENCRYPTION_KEY' : 'ENCRYPTION_KEY']) || (!renamed ? trim(environment.DATA_ENCRYPTION_KEY) : '')
  const previous = trim(environment[renamed ? 'DATA_ENCRYPTION_KEY_PREVIOUS' : 'ENCRYPTION_KEY_PREVIOUS']) || (!renamed ? trim(environment.DATA_ENCRYPTION_KEY_PREVIOUS) : '')
  const unsafe = (value) => value.length < 32 || /default|replace|changeme|example|sample|generate-a-random|insecure|password|secret/i.test(value) || /^(.)\1+$/.test(value) || new Set(value.toLowerCase()).size < 8 || /0123456789|9876543210|abcdefghijklmnopqrstuvwxyz|zyxwvutsrqponmlkjihgfedcba/i.test(value)
  if (unsafe(current) || (previous && unsafe(previous))) fail('Valid existing data encryption keys are required; this tool never generates or rotates keys.')
  return [current, ...(previous ? [previous] : [])]
}

export function decryptLegacy(value, keys) {
  if (!value || !value.includes(':')) return value
  const all = value.split(':')
  const parts = all[0] === 'v1' ? all.slice(1) : all
  if (parts.length !== 4) fail('An encrypted value has an unsupported envelope; no export was performed.')
  for (const key of keys) {
    try {
      const [iv, salt, tag, body] = parts
      const decipher = createDecipheriv('aes-256-gcm', scryptSync(key, Buffer.from(salt, 'hex'), 32), Buffer.from(iv, 'hex'))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))
      return decipher.update(body, 'hex', 'utf8') + decipher.final('utf8')
    } catch { /* Try the configured previous key, without logging ciphertext or plaintext. */ }
  }
  fail('An encrypted value is unreadable with the existing current/previous keys; refusing cutover.')
}

function canonical(provider, rows) {
  const config = providers[provider]
  const score = (row) => {
    const keys = new Set(row.secrets.map((secret) => secret.key))
    const required = config.required.filter((key) => keys.has(key)).length
    return [Number(row.providerKey === provider), Number(row.status === 'ACTIVE'), Number(required === config.required.length), Number(keys.has('META_LAST_VERIFIED_AT')), required, new Date(row.updatedAt).getTime(), new Date(row.createdAt).getTime()]
  }
  return rows.filter((row) => row.type === config.type).sort((a, b) => {
    const left = score(a), right = score(b)
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i]
    return b.id.localeCompare(a.id)
  })[0]
}

export function buildMigrationExport(state, environment, { emailProvider } = {}) {
  const keys = encryptionKeys(environment)
  const values = Object.fromEntries(passthrough.filter((name) => environment[name] !== undefined).map((name) => [name, environment[name]]))
  values.DATA_ENCRYPTION_KEY = keys[0]
  values.DATA_ENCRYPTION_KEY_PREVIOUS = keys[1] || ''
  const mediaProvider = trim(environment.MEDIA_STORAGE_PROVIDER).toLowerCase()
  values.MEDIA_STORAGE_PROVIDER = mediaProvider === 'blob' ? 'vercel-blob' : mediaProvider || 'postgres'
  values.MEDIA_PUBLIC_BASE_URL = trim(environment.MEDIA_PUBLIC_BASE_URL) || trim(environment.MEDIA_S3_PUBLIC_URL)
  if (trim(values.MEDIA_S3_ENDPOINT) && !values.MEDIA_S3_ENDPOINT.includes('://')) values.MEDIA_S3_ENDPOINT = `https://${trim(values.MEDIA_S3_ENDPOINT)}`
  const sources = {}
  for (const [provider, config] of Object.entries(providers)) {
    const row = canonical(provider, state.integrations)
    const saved = row ? Object.fromEntries(row.secrets.map((secret) => [secret.key, decryptLegacy(secret.value, keys)])) : {}
    const required = provider === 'SMTP' ? [...config.required, 'SECURE'] : config.required
    const hasRequired = required.every((key) => realCredential(saved[key])) && (provider !== 'STRIPE' || realCredential(saved.MODE) || /^sk_(test|live)_/.test(saved.SECRET_KEY || ''))
    const verified = Boolean(saved.META_LAST_VERIFIED_AT || saved.META_VERIFIED_AT)
    const useDb = row?.status === 'ACTIVE' && hasRequired && (verified || provider === 'SHIPPO' || provider === 'EASYPOST')
    const fallback = Object.fromEntries(Object.entries(config.keys).map(([key, name]) => [key, trim(environment[name])]))
    if (provider === 'SMTP') fallback.SECURE ||= 'false'
    const hasFallback = config.required.every((key) => provider === 'STRIPE' || provider === 'RESEND' ? realCredential(fallback[key]) : Boolean(fallback[key]))
    const selected = useDb ? saved : hasFallback ? fallback : {}
    sources[provider] = useDb ? 'database' : hasFallback ? 'environment' : 'missing'
    for (const [key, name] of Object.entries(config.keys)) values[name] = selected[key] || ''
    // The legacy Stripe verifier independently falls back to the environment secret.
    if (provider === 'STRIPE' && !values.STRIPE_WEBHOOK_SECRET && realCredential(environment.STRIPE_WEBHOOK_SECRET)) values.STRIPE_WEBHOOK_SECRET = trim(environment.STRIPE_WEBHOOK_SECRET)
  }
  // Legacy transactional sends only used Resend. SMTP was a settings test action.
  values.EMAIL_PROVIDER = emailProvider || (values.RESEND_API_KEY ? 'resend' : 'none')
  if (!['resend', 'smtp', 'none'].includes(values.EMAIL_PROVIDER)) fail('EMAIL_PROVIDER must be resend, smtp, or none.')
  if (values.EMAIL_PROVIDER === 'resend' && !values.RESEND_API_KEY) fail('Selected Resend has no effective credentials.')
  if (values.EMAIL_PROVIDER === 'smtp' && !values.SMTP_HOST) fail('Selected SMTP has no effective credentials.')
  const store = state.stores.find((row) => row.singletonKey === 'PRIMARY') || (state.stores.length === 1 ? state.stores[0] : null)
  if (state.stores.length && !store) fail('Store singleton is ambiguous; resolve it before exporting.')
  const explicitProvider = (value) => ['SHIPPO', 'EASYPOST'].includes(value) ? value.toLowerCase() : null
  values.SHIPPING_RATE_PROVIDER = explicitProvider(store?.activeRateProvider) || (store?.shippingProviderUsage !== 'LABELS_ONLY' ? explicitProvider(store?.shippingLiveProvider) : null) || 'none'
  values.SHIPPING_LABEL_PROVIDER = explicitProvider(store?.labelProvider) || (store?.shippingProviderUsage !== 'LIVE_RATES_ONLY' ? explicitProvider(store?.shippingLiveProvider) : null) || 'none'

  const destinations = []
  for (const row of state.integrations) {
    if (!row.webhookUrl) {
      if (!Object.values(providers).some((config) => config.type === row.type) && (row.secrets.length || row.events.length)) fail('An unhandled custom integration requires manual review before contract.')
      continue
    }
    if (row.status !== 'ACTIVE') continue
    if (!row.webhookSecret) fail('An active legacy outbound destination is unsigned; configure its signing key before cutover.')
    const url = new URL(row.webhookUrl)
    if (url.protocol !== 'https:' || url.username || url.password) fail('An outbound URL requires HTTPS without embedded credentials before cutover.')
    const reference = `OUTBOUND_WEBHOOK_${createHash('sha256').update(row.id).digest('hex').slice(0, 20).toUpperCase()}`
    values[`${reference}_SECRET`] = decryptLegacy(row.webhookSecret, keys)
    const headers = {}
    for (const secret of row.secrets.filter((entry) => entry.key.startsWith('HEADER_'))) {
      const name = secret.key.slice(7).trim()
      if (!/^[!#$%&'*+.^_|~0-9A-Za-z-]+$/.test(name) || /^(host|content-length|content-type|x-doopify-.*)$/i.test(name)) fail('An outbound custom header conflicts with protected delivery headers; resolve it before cutover.')
      const headerRef = `${reference}_HEADER_${createHash('sha256').update(name).digest('hex').slice(0, 12).toUpperCase()}`
      values[headerRef] = decryptLegacy(secret.value, keys)
      headers[name] = headerRef
    }
    destinations.push({ id: row.id, name: row.name, url: row.webhookUrl, events: row.events.map((event) => event.event).sort(), secretEnv: `${reference}_SECRET`, ...(Object.keys(headers).length ? { headers } : {}) })
  }
  return { values, destinations: destinations.sort((a, b) => a.id.localeCompare(b.id)), sources }
}

export function serializeEnvironment(values) {
  return '# Doopify migration export. Private: never commit this file.\n' + Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([name, input]) => {
    const value = String(input)
    // Validate dotenv round-trip instead of corrupting passwords containing quotes or newlines.
    const candidates = [JSON.stringify(value), `'${value}'`, `\`${value}\``, value]
    const encoded = candidates.find((candidate) => parse(`${name}=${candidate}\n`)[name] === value)
    if (encoded === undefined) fail(`Cannot losslessly encode ${name}; supply this variable through your deployment environment.`)
    return `${name}=${encoded}`
  }).join('\n') + '\n'
}

export function serializeDestinations(destinations) {
  return `import type { DoopifyEventName } from '@/server/events/types'\n\nexport type OutboundDestination = {\n  id: string\n  name: string\n  url: string\n  events: readonly DoopifyEventName[]\n  secretEnv: \`OUTBOUND_WEBHOOK_\${string}\`\n  headers?: Readonly<Record<string, \`OUTBOUND_WEBHOOK_\${string}\`>>\n}\n\nexport const outboundDestinations: readonly OutboundDestination[] = ${JSON.stringify(destinations, null, 2)}\n`
}

export function parseDestinations(source) {
  const file = ts.createSourceFile('destinations.ts', source, ts.ScriptTarget.Latest, true)
  const evaluate = (node) => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluate)
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) fail('Destination configuration must contain literal object properties.')
      return [property.name.text, evaluate(property.initializer)]
    }))
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return evaluate(node.expression)
    fail('Destination configuration must be a checked-in literal; expressions and imports are not executed.')
  }
  for (const statement of file.statements) if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (declaration.name.getText(file) === 'outboundDestinations' && declaration.initializer) return evaluate(declaration.initializer)
  fail('Missing literal outboundDestinations export.')
}

export async function writeExclusiveExports(files, repositoryRoot = ROOT) {
  const repo = await realpath(repositoryRoot)
  const handles = []
  try {
    for (const [target, content] of files) {
      if (!path.isAbsolute(target)) fail('Export paths must be absolute and outside the repository.')
      const parent = await realpath(path.dirname(target))
      const resolved = path.join(parent, path.basename(target))
      const relative = path.relative(repo, resolved)
      if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) fail('Credential export inside the repository is forbidden.')
      const handle = await open(resolved, 'wx', 0o600)
      handles.push({ handle, resolved, content })
      if (process.platform === 'win32') {
        const who = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true })
        const sid = who.stdout?.match(/S-1-5-\d+(?:-\d+)+/)?.[0]
        if (!sid) fail('Cannot restrict export file permissions for the current Windows user.')
        const acl = spawnSync('icacls.exe', [resolved, '/inheritance:r', '/grant:r', `*${sid}:(F)`, '*S-1-5-18:(F)'], { encoding: 'utf8', windowsHide: true })
        if (acl.status !== 0) fail('Cannot restrict export file permissions; no secrets were written.')
      }
    }
    for (const { handle, content } of handles) { await handle.writeFile(content); await handle.sync() }
  } catch (error) {
    for (const { handle, resolved } of handles) { await handle.close().catch(() => {}); await unlink(resolved).catch(() => {}) }
    throw error
  } finally { for (const { handle } of handles) await handle.close().catch(() => {}) }
}

export async function readLegacyState(client) {
  const exists = await client.query("SELECT to_regclass('integrations') AS table_name")
  if (!exists.rows[0]?.table_name) fail('Legacy integration tables are absent; this installation is fresh or already contracted.')
  const [integrations, secrets, events, stores] = await Promise.all([
    client.query('SELECT * FROM "integrations"'), client.query('SELECT * FROM "integration_secrets"'),
    client.query('SELECT * FROM "integration_events"'), client.query('SELECT "id", "singletonKey", "shippingLiveProvider", "shippingProviderUsage", "activeRateProvider", "labelProvider" FROM "stores"'),
  ])
  return { integrations: integrations.rows.map((row) => ({ ...row, secrets: secrets.rows.filter((secret) => secret.integrationId === row.id), events: events.rows.filter((event) => event.integrationId === row.id) })), stores: stores.rows }
}

export async function inspectMigrationTarget(client) {
  // Dynamic import avoids changing the caller's explicit environment before it is captured.
  const { collectDeploymentState, evaluateMigrationDeploymentSafety } = await import('./migration-deployment-preflight.mjs')
  const state = await collectDeploymentState(client)
  const safety = evaluateMigrationDeploymentSafety(state)
  if (!safety.ok || state.failedMigrationNames.length) fail('Migration history is missing, unknown, failed, or unsafe. Run the existing migration preflight and resolve its reviewed runbook before cutover.')
  return state
}

export async function verifyMigration(client, plan, targetEnvironment, destinations) {
  // Preservation alone is insufficient if the renamed export cannot boot.
  try { parseEnvironment({ ...targetEnvironment, NODE_ENV: 'production' }) }
  catch (error) { fail(error.message) }
  const mismatch = Object.keys(plan.values).filter((name) => String(targetEnvironment[name] ?? '') !== String(plan.values[name]))
  if (mismatch.length) fail(`Environment does not preserve the export: ${mismatch.join(', ')}.`)
  const normalized = (rows) => JSON.stringify(rows.map((row) => ({ id: row.id, name: row.name, url: row.url, events: [...row.events].sort(), secretEnv: row.secretEnv, headers: Object.entries(row.headers || {}).sort(([a], [b]) => a.localeCompare(b)) })).sort((a, b) => a.id.localeCompare(b.id)))
  if (normalized(destinations) !== normalized(plan.destinations)) fail('Developer outbound configuration does not preserve destination IDs, URLs, events, and secret references.')
  const types = ts.createSourceFile('events.ts', await readFile(path.join(ROOT, 'src/server/events/types.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  const eventType = types.statements.find((statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'DoopifyEvents')
  const knownEvents = new Set(eventType?.type.members?.map((member) => member.name?.text) || [])
  if (destinations.some((entry) => entry.events.some((event) => !knownEvents.has(event)))) fail('An outbound subscription is not a current typed commerce event.')
  const keys = encryptionKeys(targetEnvironment, true)
  let encryptedValuesChecked = 0
  // Bounded scans do not mutate or rotate any envelope.
  for (const [table, columns] of [['users', ['mfaTotpSecretEnc', 'mfaTotpPendingSecretEnc']], ['digital_download_deliveries', ['tokenEnc']]]) {
    let cursor = ''
    while (true) {
      const result = await client.query(`SELECT "id", ${columns.map(quote).join(', ')} FROM ${quote(table)} WHERE "id" > $1 ORDER BY "id" LIMIT 100`, [cursor])
      for (const row of result.rows) for (const column of columns) if (row[column]) { decryptLegacy(row[column], keys); encryptedValuesChecked++ }
      if (result.rows.length < 100) break
      cursor = result.rows.at(-1).id
    }
  }
  const snapshots = await client.query('SELECT count(*)::int AS count FROM "outbound_webhook_deliveries" WHERE "destinationName" IS NULL OR "destinationUrl" IS NULL')
  if (snapshots.rows[0].count) fail('Delivery snapshots are incomplete; apply the additive migration before cutover.')
  const inactivePending = await client.query(`SELECT count(*)::int AS count FROM "outbound_webhook_deliveries" d JOIN "integrations" i ON i.id = d."integrationId" WHERE i.status = 'INACTIVE' AND d.status IN ('PENDING', 'RETRYING')`)
  if (inactivePending.rows[0].count) fail('Inactive legacy destinations still have pending deliveries; resolve them before cutover.')
  return { verified: true, environmentVariablesChecked: Object.keys(plan.values).length, destinationsChecked: destinations.length, encryptedValuesChecked }
}

export async function contractLegacyConfiguration(client, { legacyEnvironment, emailProvider, targetEnvironment, destinations, maintenanceWindow, backupConfirmed, cutoverVerified, confirmContract }) {
  if (!maintenanceWindow || !backupConfirmed || !cutoverVerified || !confirmContract) fail('Contract requires --maintenance-window --backup-confirmed --cutover-verified --confirm-contract after deployed validation and a tested backup.')
  const history = await inspectMigrationTarget(client)
  if (!history.appliedMigrationNames.includes(EXPAND_MIGRATION)) fail('The additive env-only migration must be applied before contract.')
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query('LOCK TABLE "_prisma_migrations", "integrations", "integration_secrets", "integration_events", "stores", "jobs", "webhook_deliveries", "outbound_webhook_deliveries", "email_deliveries" IN ACCESS EXCLUSIVE MODE')
    await inspectMigrationTarget(client)
    const plan = buildMigrationExport(await readLegacyState(client), legacyEnvironment, { emailProvider })
    await verifyMigration(client, plan, targetEnvironment, destinations)
    const queues = await client.query(`SELECT (SELECT count(*) FROM jobs WHERE status IN ('PENDING', 'RUNNING', 'RETRYING')) + (SELECT count(*) FROM webhook_deliveries WHERE status IN ('RECEIVED', 'RETRY_PENDING')) + (SELECT count(*) FROM outbound_webhook_deliveries WHERE status IN ('PENDING', 'RETRYING')) + (SELECT count(*) FROM email_deliveries WHERE status IN ('PENDING', 'RETRYING', 'RESEND_REQUESTED')) AS count`)
    if (Number(queues.rows[0].count)) fail('Jobs and delivery queues are not drained; contract refused.')
    const references = await client.query(`SELECT count(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND confrelid = 'integrations'::regclass AND conrelid NOT IN ('integration_events'::regclass, 'integration_secrets'::regclass)`)
    if (references.rows[0].count) fail('Legacy integration tables still have external references; contract refused.')
    await client.query('DROP TABLE "integration_events", "integration_secrets", "integrations"')
    await client.query('ALTER TABLE "stores" DROP COLUMN "shippingLiveProvider", DROP COLUMN "shippingProviderUsage", DROP COLUMN "activeRateProvider", DROP COLUMN "labelProvider"')
    await client.query('DROP TYPE "IntegrationStatus"')
    await client.query('COMMIT')
    return { contracted: true, droppedTables: 3, droppedStoreColumns: 4, deliveryHistoryPreserved: true }
  } catch (error) { await client.query('ROLLBACK'); throw error }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const option = (name) => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1] }
  if (!['status', 'export', 'verify', 'contract'].includes(command)) fail('Usage: node scripts/env-only-migration.mjs status|export|verify|contract --legacy-env-file PATH [--env-file PATH --destinations-file PATH --email-provider smtp]')
  const environment = option('legacy-env-file') ? { ...process.env, ...parse(await readFile(option('legacy-env-file'))) } : { ...process.env }
  if (!environment.DATABASE_URL) fail('DATABASE_URL is required; use the existing deployment environment or an explicit --legacy-env-file.')
  const url = new URL(environment.DATABASE_URL)
  const client = new pg.Client({ connectionString: url.toString() })
  try {
    await client.connect()
    await client.query(`SET search_path TO ${quote(url.searchParams.get('schema') || 'public')}`)
    const history = await inspectMigrationTarget(client)
    const state = await readLegacyState(client)
    const plan = buildMigrationExport(state, environment, { emailProvider: option('email-provider') })
    if (command === 'status') { console.log(JSON.stringify({ sources: plan.sources, outboundDestinations: plan.destinations.length, additiveMigrationApplied: history.appliedMigrationNames.includes(EXPAND_MIGRATION) })); return }
    if (!option('env-file') || !option('destinations-file')) fail('--env-file and --destinations-file are required.')
    if (command === 'export') {
      await writeExclusiveExports([[option('env-file'), serializeEnvironment(plan.values)], [option('destinations-file'), serializeDestinations(plan.destinations)]])
      console.log(JSON.stringify({ exported: true, environmentVariableCount: Object.keys(plan.values).length, outboundDestinationCount: plan.destinations.length })); return
    }
    if (!history.appliedMigrationNames.includes(EXPAND_MIGRATION)) fail('Apply the additive migration before verifying cutover.')
    const targetEnvironment = parse(await readFile(option('env-file')))
    const destinations = parseDestinations(await readFile(option('destinations-file'), 'utf8'))
    const result = command === 'verify' ? await verifyMigration(client, plan, targetEnvironment, destinations) : await contractLegacyConfiguration(client, { legacyEnvironment: environment, emailProvider: option('email-provider'), targetEnvironment, destinations, maintenanceWindow: args.includes('--maintenance-window'), backupConfirmed: args.includes('--backup-confirmed'), cutoverVerified: args.includes('--cutover-verified'), confirmContract: args.includes('--confirm-contract') })
    console.log(JSON.stringify(result))
  } finally { await client.end().catch(() => {}) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof MigrationError ? error.message : 'Migration operation failed; no secret values are logged. Check target connectivity, file permissions, and schema prerequisites locally.')
  process.exitCode = 1
})

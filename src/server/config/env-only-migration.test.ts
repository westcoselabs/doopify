import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { parseEnvironment } from '@/lib/env-schema'
import { buildMigrationExport, decryptLegacy, parseDestinations, serializeDestinations, serializeEnvironment, writeExclusiveExports } from '../../../scripts/env-only-migration.mjs'

const key = 'K9zvH2rsT7dqF4wmC8npL1ubJ6eaY5goD3xiV0hkQ2c'
function encrypt(value: string, previous = key, version = true) {
  const iv = randomBytes(16), salt = randomBytes(64), cipher = createCipheriv('aes-256-gcm', scryptSync(previous, salt, 32), iv)
  const body = cipher.update(value, 'utf8', 'hex') + cipher.final('hex')
  return `${version ? 'v1:' : ''}${iv.toString('hex')}:${salt.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body}`
}
function integration(provider: string, credentials: Record<string, string>, extra: Record<string, unknown> = {}) {
  return { id: provider, providerKey: provider, name: provider, type: { STRIPE: 'PAYMENT_STRIPE', RESEND: 'EMAIL_RESEND', SMTP: 'EMAIL_SMTP', SHIPPO: 'SHIPPING_SHIPPO' }[provider], status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(), webhookSecret: null as string | null, events: [] as { event: string }[], secrets: Object.entries(credentials).map(([key, value]) => ({ key, value: encrypt(value) })), ...extra }
}
const environment = { ENCRYPTION_KEY: ` ${key} `, STRIPE_SECRET_KEY: 'sk_test_env', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_env', STRIPE_WEBHOOK_SECRET: 'whsec_env', RESEND_WEBHOOK_SECRET: 'whsec_resend_env' }

describe('offline env-only credential migration', () => {
  it('exports bootable canonical storage names and preserves the legacy CDN URL', () => {
    const exported = buildMigrationExport({ stores: [], integrations: [] }, { ...environment, DATABASE_URL: 'postgresql://fixture@127.0.0.1/fixture', JWT_SECRET: 'fixture-authentication-key-only', MEDIA_STORAGE_PROVIDER: 'blob', MEDIA_S3_PUBLIC_URL: 'https://cdn.example.test' })
    const config = parseEnvironment({ ...parse(serializeEnvironment(exported.values)), NODE_ENV: 'production' })
    expect(config.MEDIA_STORAGE_PROVIDER).toBe('vercel-blob')
    expect(config.MEDIA_PUBLIC_BASE_URL).toBe('https://cdn.example.test')
    expect(config.DATA_ENCRYPTION_KEY).toBe(key)
    expect(config.DATA_ENCRYPTION_KEY_PREVIOUS).toBeUndefined()
  })
  it('preserves canonical verified DB precedence, independent webhook fallback, and shipping legacy selection', () => {
    const rows = [integration('STRIPE', { SECRET_KEY: 'sk_test_db', PUBLISHABLE_KEY: 'pk_test_db', META_LAST_VERIFIED_AT: 'verified' }), integration('SHIPPO', { API_KEY: 'shippo_test_db' })]
    const result = buildMigrationExport({ integrations: rows, stores: [{ singletonKey: 'PRIMARY', activeRateProvider: 'NONE', labelProvider: 'EASYPOST', shippingLiveProvider: 'SHIPPO', shippingProviderUsage: 'LIVE_RATES_ONLY' }] }, environment)
    expect(result.values).toMatchObject({ DATA_ENCRYPTION_KEY: key, STRIPE_SECRET_KEY: 'sk_test_db', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_db', STRIPE_WEBHOOK_SECRET: 'whsec_env', SHIPPO_API_KEY: 'shippo_test_db', SHIPPING_RATE_PROVIDER: 'shippo', SHIPPING_LABEL_PROVIDER: 'easypost', RESEND_WEBHOOK_SECRET: 'whsec_resend_env' })
    expect(result.values).not.toHaveProperty('ENCRYPTION_KEY')
    expect((result.sources as Record<string,string>).STRIPE).toBe('database')
    rows[0].secrets = rows[0].secrets.filter((secret) => secret.key !== 'META_LAST_VERIFIED_AT')
    expect(buildMigrationExport({ integrations: rows, stores: [] }, environment).values.STRIPE_SECRET_KEY).toBe('sk_test_env')
  })
  it('preserves Resend transactional routing when both providers exist and makes SMTP switching explicit', () => {
    const state = { stores: [], integrations: [integration('RESEND', { API_KEY: 're_db', META_VERIFIED_AT: 'verified' }), integration('SMTP', { HOST: 'smtp.example.test', PORT: '587', SECURE: 'false', USERNAME: 'smtpuser', PASSWORD: 'smtppass', META_LAST_VERIFIED_AT: 'verified' })] }
    expect(buildMigrationExport(state, environment).values.EMAIL_PROVIDER).toBe('resend')
    expect(buildMigrationExport(state, environment, { emailProvider: 'smtp' }).values.EMAIL_PROVIDER).toBe('smtp')
  })
  it('exports the same outbound identity and signing/header bytes and refuses unsigned destinations', () => {
    const state = { stores: [], integrations: [integration('custom', { HEADER_Authorization: 'Bearer original-token' }, { id: 'original-endpoint-id', type: 'CUSTOM', providerKey: null, webhookUrl: 'https://merchant.example.test/events', webhookSecret: encrypt('original-hmac'), events: [{ event: 'order.paid' }] })] }
    const result = buildMigrationExport(state, environment)
    expect(result.destinations[0]).toMatchObject({ id: 'original-endpoint-id', url: 'https://merchant.example.test/events', events: ['order.paid'] })
    expect(result.values[result.destinations[0].secretEnv]).toBe('original-hmac')
    expect(result.values[(result.destinations[0].headers as Record<string,string>).Authorization]).toBe('Bearer original-token')
    expect(parseDestinations(serializeDestinations(result.destinations))).toEqual(result.destinations)
    state.integrations[0].webhookSecret = null
    expect(() => buildMigrationExport(state, environment)).toThrow('unsigned')
  })
  it('reads versioned and legacy envelopes using previous keys without rewriting ciphertext', () => {
    const previous = 'J8rdF2maX7qpT4vcH9beK1nsD6wgY5uoL3ziC0kxP2h'
    for (const version of [true, false]) {
      const value = encrypt('original-value', previous, version)
      expect(decryptLegacy(value, [key, previous])).toBe('original-value')
      expect(() => decryptLegacy(value, [key])).toThrow('unreadable')
    }
  })
  it('round-trips secret punctuation and rejects executable destination expressions', () => {
    const values = { KEY: 'p#ss\\n"word', TOKEN: "token'with\nnewline" }
    expect(parse(serializeEnvironment(values))).toEqual(values)
    expect(() => parseDestinations('export const outboundDestinations = readSecrets()')).toThrow('literal')
  })
  it('writes exclusive private files outside the repository and refuses overwrite or in-repo export', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'doopify-export-test-'))
    const target = path.join(directory, '.env')
    try {
      await writeExclusiveExports([[target, 'TEST=inert\n']])
      expect(await readFile(target, 'utf8')).toBe('TEST=inert\n')
      await expect(writeExclusiveExports([[target, 'TEST=overwrite\n']])).rejects.toThrow()
      expect(await readFile(target, 'utf8')).toBe('TEST=inert\n')
      await expect(writeExclusiveExports([[path.resolve('should-never-exist.env'), 'TEST=inert']])).rejects.toThrow('repository')
    } finally { await unlink(target).catch(() => {}); await rmdir(directory) }
  })
})

import { describe, expect, it, vi } from 'vitest'

import { envSchema, parseEnvironment } from './env-schema'
import { getEnvironmentSecret } from './env'

describe('environment validation', () => {
  const productionBase = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/doopify',
    JWT_SECRET: 'jwt-secret-with-at-least-sixteen-characters',
    DATA_ENCRYPTION_KEY: 'D9g_7eQx3mF5aP1vK8rT2yW6cN4hJ0sL9bU5zX1qR7M',
    NODE_ENV: 'production',
  }

  it('accepts an absolute legacy-session cutoff and rejects an invalid one', () => {
    expect(envSchema.safeParse({ ...productionBase, SESSION_LEGACY_TOKEN_CUTOFF: '2030-01-08T12:00:00.000Z' }).success).toBe(true)
    expect(envSchema.safeParse({ ...productionBase, SESSION_LEGACY_TOKEN_CUTOFF: 'next week' }).success).toBe(false)
  })
  it('defaults email to disabled and rejects production preview', () => {
    expect(envSchema.parse(productionBase).EMAIL_PROVIDER).toBe('none')
    expect(envSchema.safeParse({ ...productionBase, EMAIL_PROVIDER: 'preview' }).success).toBe(false)
  })
  it('accepts an absent previous key in a migration export while preserving the effective current key', () => {
    const config = parseEnvironment({ ...productionBase, DATA_ENCRYPTION_KEY: ` ${productionBase.DATA_ENCRYPTION_KEY} `, DATA_ENCRYPTION_KEY_PREVIOUS: '' })
    expect(config.DATA_ENCRYPTION_KEY).toBe(productionBase.DATA_ENCRYPTION_KEY)
    expect(config.DATA_ENCRYPTION_KEY_PREVIOUS).toBeUndefined()
    expect(() => parseEnvironment({ ...productionBase, DATA_ENCRYPTION_KEY_PREVIOUS: 'bad' })).toThrow('DATA_ENCRYPTION_KEY_PREVIOUS')
  })
  it('preserves outbound signing-key bytes and restricts dynamic lookup to outbound references', () => {
    vi.stubEnv('OUTBOUND_WEBHOOK_PRESERVATION_SECRET', '  original-signing-bytes\n')
    try {
      expect(getEnvironmentSecret('OUTBOUND_WEBHOOK_PRESERVATION_SECRET')).toBe('  original-signing-bytes\n')
      expect(() => getEnvironmentSecret('JWT_SECRET' as never)).toThrow('Invalid outbound')
    } finally { vi.unstubAllEnvs() }
  })
  it('normalizes empty and placeholder credentials without configuring a provider', () => {
    const config = envSchema.parse({ ...productionBase, STRIPE_SECRET_KEY: '  ', RESEND_API_KEY: 'replace-me', SMTP_PORT: '465', SMTP_SECURE: 'true' })
    expect(config.STRIPE_SECRET_KEY).toBeUndefined()
    expect(config.RESEND_API_KEY).toBeUndefined()
    expect(config.SMTP_PORT).toBe(465)
    expect(config.SMTP_SECURE).toBe(true)
  })
  it('rejects mixed Stripe modes, unknown selectors and invalid SMTP ports without leaking values', () => {
    expect(envSchema.safeParse({ ...productionBase, STRIPE_SECRET_KEY: 'sk_live_private', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public' }).success).toBe(false)
    expect(envSchema.safeParse({ ...productionBase, SHIPPING_RATE_PROVIDER: 'unknown' }).success).toBe(false)
    expect(() => parseEnvironment({ ...productionBase, SMTP_PORT: 'private-credential' })).toThrow('Invalid environment configuration: SMTP_PORT')
  })
})

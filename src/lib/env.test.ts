import { describe, expect, it } from 'vitest'

import { envSchema } from './env'

describe('environment validation', () => {
  const productionBase = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/doopify',
    JWT_SECRET: 'jwt-secret-with-at-least-sixteen-characters',
    ENCRYPTION_KEY: 'D9g_7eQx3mF5aP1vK8rT2yW6cN4hJ0sL9bU5zX1qR7M',
    NODE_ENV: 'production',
  }

  it('accepts an absolute legacy-session cutoff and rejects an invalid one', () => {
    expect(envSchema.safeParse({ ...productionBase, SESSION_LEGACY_TOKEN_CUTOFF: '2030-01-08T12:00:00.000Z' }).success).toBe(true)
    expect(envSchema.safeParse({ ...productionBase, SESSION_LEGACY_TOKEN_CUTOFF: 'next week' }).success).toBe(false)
  })
})

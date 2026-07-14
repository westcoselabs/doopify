import { vi } from 'vitest'

import { applyInertTestEnvironment } from './scripts/test-environment.mjs'

vi.stubEnv('NODE_ENV', 'test')
applyInertTestEnvironment(process.env, {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/doopify_test',
  JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-at-least-16-chars',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'D9g_7eQx3mF5aP1vK8rT2yW6cN4hJ0sL9bU5zX1qR7M',
  NODE_ENV: 'test',
})

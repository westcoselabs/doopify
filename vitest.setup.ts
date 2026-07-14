import { vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'test')
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/doopify_test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-16-chars'
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'D9g_7eQx3mF5aP1vK8rT2yW6cN4hJ0sL9bU5zX1qR7M'
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_doopify'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_doopify_test'
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_doopify'

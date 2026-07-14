import { describe, expect, it } from 'vitest'

import { createInertTestEnvironment, EXTERNAL_CREDENTIAL_ENV_NAMES } from '../../../scripts/test-environment.mjs'

describe('test runner credential isolation', () => {
  it('removes live-looking provider and deployment credentials before spawning normal tests', () => {
    const childEnvironment = createInertTestEnvironment(
      Object.fromEntries(EXTERNAL_CREDENTIAL_ENV_NAMES.map((name) => [name, `live-${name}-sentinel`]))
    )

    expect(childEnvironment.STRIPE_SECRET_KEY).toBe('sk_test_doopify_inert_runner')
    expect(childEnvironment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBe('pk_test_doopify_inert_runner')
    expect(childEnvironment.SHIPPO_API_KEY).toBe('shippo_inert_test_runner')
    expect(childEnvironment.RESEND_API_KEY).toBeUndefined()
    expect(childEnvironment.SMTP_HOST).toBeUndefined()
    expect(childEnvironment.VERCEL_TOKEN).toBeUndefined()
  })
})

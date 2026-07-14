import { describe, expect, it } from 'vitest'

import { createInertTestEnvironment, EXTERNAL_CREDENTIAL_ENV_NAMES } from '../../../scripts/test-environment.mjs'

describe('test runner credential isolation', () => {
  it('replaces parent credentials in the normal Vitest process with inert or absent values', () => {
    expect(process.env.STRIPE_SECRET_KEY).toBe('sk_test_doopify_inert_runner')
    expect(process.env.SHIPPO_API_KEY).toBe('shippo_inert_test_runner')
    expect(process.env.EASYPOST_API_KEY).toBe('EZTK_inert_test_runner')
    expect(process.env.RESEND_API_KEY).toBeUndefined()
    expect(process.env.SMTP_PASSWORD).toBeUndefined()
    expect(process.env.VERCEL_TOKEN).toBeUndefined()
    expect(process.env.BLOB_READ_WRITE_TOKEN).toBeUndefined()
  })

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
    expect(childEnvironment.BLOB_READ_WRITE_TOKEN).toBeUndefined()
    expect(childEnvironment.MEDIA_S3_SECRET_ACCESS_KEY).toBeUndefined()
    expect(childEnvironment.DOOPIFY_LIVE_PROVIDER_SMOKE_TEST).toBeUndefined()
  })
})

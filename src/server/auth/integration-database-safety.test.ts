import { describe, expect, it } from 'vitest'

import { buildIntegrationTestEnvironments } from '../../../scripts/run-integration-tests.mjs'
import { resetIntegrationSchema } from '../../../scripts/prepare-integration-db.mjs'

const testUrl = 'postgresql://test_user:test_password@test-db.example:5432/doopify_test?schema=public'
const normalUrl = 'postgresql://developer:developer_password@localhost:5432/doopify_dev?schema=public'

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL_TEST: testUrl,
    E2E_DATABASE_URL: testUrl,
    DATABASE_URL: normalUrl,
    DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA: '1',
    STRIPE_SECRET_KEY: 'sk_live_test_sentinel',
    SHIPPO_API_KEY: 'shippo_live_test_sentinel',
    ...overrides,
  }
}

describe('integration database reset safety', () => {
  it('allows exact matching disposable public targets only with explicit acknowledgement', () => {
    const result = buildIntegrationTestEnvironments(environment())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.prepareEnvironment.ALLOW_PUBLIC_TEST_SCHEMA).toBe('1')
    expect(result.testEnvironment.ALLOW_PUBLIC_TEST_SCHEMA).toBeUndefined()
    expect(result.prepareEnvironment.STRIPE_SECRET_KEY).toBe('sk_test_doopify_inert_runner')
    expect(result.prepareEnvironment.SHIPPO_API_KEY).toBe('shippo_inert_test_runner')
  })

  it.each([
    ['different database', { E2E_DATABASE_URL: 'postgresql://test_user:test_password@test-db.example:5432/other?schema=public' }],
    ['different host', { E2E_DATABASE_URL: 'postgresql://test_user:test_password@other-db.example:5432/doopify_test?schema=public' }],
    ['different username', { E2E_DATABASE_URL: 'postgresql://other_user:test_password@test-db.example:5432/doopify_test?schema=public' }],
    ['different schema', { E2E_DATABASE_URL: 'postgresql://test_user:test_password@test-db.example:5432/doopify_test?schema=other' }],
    ['missing acknowledgement', { DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA: undefined }],
    ['matching normal development database', { DATABASE_URL: testUrl }],
  ])('denies %s before a child reset can be authorized', (_name, overrides) => {
    const result = buildIntegrationTestEnvironments(environment(overrides))
    expect(result).toMatchObject({ ok: false })
  })

  it('does not execute schema-drop SQL for every denied target', async () => {
    const queries: string[] = []
    const deniedCases = [
      environment({ E2E_DATABASE_URL: 'postgresql://test_user:test_password@other-db.example:5432/doopify_test?schema=public' }),
      environment({ DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA: undefined }),
      environment({ DATABASE_URL: testUrl }),
    ]

    for (const deniedEnvironment of deniedCases) {
      const result = await resetIntegrationSchema({
        environment: deniedEnvironment,
        createClient: () => ({
          connect: async () => { throw new Error('connect must not run for denied reset') },
          query: async (sql: string) => { queries.push(sql) },
          end: async () => {},
        }),
      })
      expect(result).toMatchObject({ ok: false, dropped: false })
    }
    expect(queries).toEqual([])
  })
})

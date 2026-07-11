import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    integration: {
      findMany: mocks.findMany,
    },
  },
}))

import { resolveCanonicalProviderIntegration } from './provider-integration-resolver'

function integration(input: Partial<{
  id: string
  providerKey: string | null
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: Date
  updatedAt: Date
  secrets: Array<{ id: string; key: string; value: string }>
}>) {
  return {
    id: input.id ?? 'integration',
    providerKey: input.providerKey ?? null,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? new Date('2026-07-11T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-07-11T00:00:00.000Z'),
    secrets: input.secrets ?? [],
  }
}

describe('provider integration resolver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('selects the older verified Shippo row over a newer incomplete legacy duplicate', async () => {
    mocks.findMany.mockResolvedValue([
      integration({
        id: 'shippo_new_incomplete',
        createdAt: new Date('2026-07-11T02:00:00.000Z'),
      }),
      integration({
        id: 'shippo_old_verified',
        createdAt: new Date('2026-07-11T01:00:00.000Z'),
        secrets: [
          { id: 'api', key: 'API_KEY', value: 'encrypted' },
          { id: 'verified', key: 'META_LAST_VERIFIED_AT', value: 'encrypted' },
        ],
      }),
    ])

    await expect(resolveCanonicalProviderIntegration('SHIPPO')).resolves.toMatchObject({
      id: 'shippo_old_verified',
    })
  })

  it('selects the explicit canonical record even when a newer duplicate exists', async () => {
    mocks.findMany.mockResolvedValue([
      integration({
        id: 'stripe_new_duplicate',
        updatedAt: new Date('2026-07-11T02:00:00.000Z'),
        secrets: [
          { id: 'publishable', key: 'PUBLISHABLE_KEY', value: 'encrypted' },
          { id: 'secret', key: 'SECRET_KEY', value: 'encrypted' },
        ],
      }),
      integration({
        id: 'stripe_canonical',
        providerKey: 'STRIPE',
        status: 'INACTIVE',
      }),
    ])

    await expect(resolveCanonicalProviderIntegration('STRIPE')).resolves.toMatchObject({
      id: 'stripe_canonical',
    })
  })
})

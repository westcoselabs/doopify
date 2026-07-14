// @ts-nocheck
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'

const auth = vi.hoisted(() => ({
  requireOwner: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: 'shippo-route-owner', email: 'shippo-route-owner@example.com', role: 'OWNER' },
  }),
}))

vi.mock('@/server/auth/require-auth', () => ({ requireOwner: auth.requireOwner }))

import { POST } from './route'
import { connectShippingProvider } from '@/server/shipping/shipping-provider.service'
import { decrypt } from '@/server/utils/crypto'

const runIntegration =
  process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
    ? describe
    : describe.skip

const originalFetch = globalThis.fetch

async function cleanShippo() {
  const integrations = await prisma.integration.findMany({ where: { type: 'SHIPPING_SHIPPO' }, select: { id: true } })
  if (!integrations.length) return
  await prisma.integrationSecret.deleteMany({ where: { integrationId: { in: integrations.map((entry) => entry.id) } } })
  await prisma.integration.deleteMany({ where: { id: { in: integrations.map((entry) => entry.id) } } })
}

function shippoResponse(status: number, body: Record<string, unknown> = { results: [{ object_id: 'shippo-account', carrier: 'USPS' }] }) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function testRoute(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/settings/shipping/test-provider', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

runIntegration('saved Shippo provider route integration', () => {
  beforeEach(async () => {
    await cleanShippo()
    vi.restoreAllMocks()
  }, 60_000)

  afterAll(async () => {
    globalThis.fetch = originalFetch
    await cleanShippo()
    await prisma.$disconnect()
  }, 60_000)

  it('uses the encrypted saved key for empty input and a candidate only when supplied', async () => {
    await connectShippingProvider({ provider: 'SHIPPO', apiKey: 'shippo_saved_route_key' })
    const authorizationHeaders: string[] = []
    globalThis.fetch = vi.fn(async (_url, init) => {
      authorizationHeaders.push(String(new Headers(init?.headers).get('authorization')))
      return shippoResponse(200)
    })

    const savedResponse = await testRoute({ provider: 'SHIPPO' })
    expect(savedResponse.status).toBe(200)
    expect((await savedResponse.json()).data.result.ok).toBe(true)
    expect(authorizationHeaders).toEqual(['ShippoToken shippo_saved_route_key'])

    const candidateResponse = await testRoute({ provider: 'SHIPPO', apiKey: 'shippo_candidate_route_key' })
    expect(candidateResponse.status).toBe(200)
    expect((await candidateResponse.json()).data.result.ok).toBe(true)
    expect(authorizationHeaders).toEqual([
      'ShippoToken shippo_saved_route_key',
      'ShippoToken shippo_candidate_route_key',
    ])

    const savedSecret = await prisma.integrationSecret.findFirstOrThrow({ where: { key: 'API_KEY' } })
    expect(decrypt(savedSecret.value)).toBe('shippo_saved_route_key')

    const maskedResponse = await testRoute({ provider: 'SHIPPO', apiKey: 'shippo_******1234' })
    expect(maskedResponse.status).toBe(422)
    expect(authorizationHeaders).toHaveLength(2)
  })

  it('preserves connected state for a retryable saved-key failure and marks a definitive authentication failure', async () => {
    await connectShippingProvider({ provider: 'SHIPPO', apiKey: 'shippo_saved_route_key' })
    globalThis.fetch = vi.fn(async () => shippoResponse(200))
    await testRoute({ provider: 'SHIPPO' })

    globalThis.fetch = vi.fn(async () => shippoResponse(503, { detail: 'temporary outage' }))
    const retryable = await testRoute({ provider: 'SHIPPO' })
    const retryablePayload = await retryable.json()
    expect(retryablePayload.data.result).toMatchObject({ ok: false })
    expect(retryablePayload.data.status).toMatchObject({ state: 'VERIFIED', verificationState: 'VERIFIED' })

    globalThis.fetch = vi.fn(async () => shippoResponse(401, { detail: 'invalid token' }))
    const definitive = await testRoute({ provider: 'SHIPPO' })
    const definitivePayload = await definitive.json()
    expect(definitivePayload.data.result).toMatchObject({ ok: false })
    expect(definitivePayload.data.status).toMatchObject({ state: 'ERROR', verificationState: 'DEFINITIVE_ERROR' })
  })
})

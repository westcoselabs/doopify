import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { claimDueJobs, enqueueJob, markJobSuccess } from './job.service'
import { claimWebhookDelivery, markWebhookDeliveryProcessed, recordRejectedWebhook, recordVerifiedWebhookDelivery } from '@/server/services/webhook-delivery.service'

vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: vi.fn() }))
const suite = process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST ? describe : describe.skip

suite('real database delivery ownership', () => {
  beforeEach(async () => { await prisma.job.deleteMany() })
  afterEach(async () => {
    await prisma.job.deleteMany({ where: { type: 'CLAIM_TEST' } })
    await prisma.webhookDelivery.deleteMany({ where: { provider: 'claim-test' } })
  })

  it('allows one job claimant and fences expired worker completion', async () => {
    const created = await enqueueJob('CLAIM_TEST', {})
    const claims = (await Promise.all([claimDueJobs(1), claimDueJobs(1)])).flat().filter((job) => job.id === created.id)
    expect(claims).toHaveLength(1)
    const first = claims[0]
    await prisma.job.update({ where: { id: first.id }, data: { leaseExpiresAt: new Date(Date.now() - 1) } })
    const [replacement] = await claimDueJobs(1)
    expect(replacement.claimToken).not.toBe(first.claimToken)
    await expect(markJobSuccess(first.id, first.claimToken!)).rejects.toThrow('ownership changed')
    expect((await markJobSuccess(replacement.id, replacement.claimToken!)).status).toBe('SUCCESS')
    expect((await prisma.job.findUniqueOrThrow({ where: { id: created.id } })).attempts).toBe(2)
  })

  it('shares one inbound claim between ingress and replay, then recovers expiration', async () => {
    const delivery = await recordVerifiedWebhookDelivery({ provider: 'claim-test', providerEventId: 'evt_claim', eventType: 'order.paid', payload: '{"verified":true}' })
    const claims = (await Promise.all([claimWebhookDelivery(delivery.id), claimWebhookDelivery(delivery.id, true)])).filter(Boolean)
    expect(claims).toHaveLength(1)
    const first = claims[0]!
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { leaseExpiresAt: new Date(Date.now() - 1) } })
    const replacement = await claimWebhookDelivery(delivery.id)
    expect(replacement?.claimToken).not.toBe(first.claimToken)
    expect(await markWebhookDeliveryProcessed({ provider: first.provider, providerEventId: first.providerEventId, claimToken: first.claimToken! })).toBeNull()
    expect((await markWebhookDeliveryProcessed({ provider: first.provider, providerEventId: first.providerEventId, claimToken: replacement!.claimToken! }))?.status).toBe('PROCESSED')
  })

  it('cannot overwrite verified state through rejected or repeated receipts', async () => {
    const input = { provider: 'claim-test', providerEventId: 'evt_immutable', eventType: 'order.paid', payload: '{"id":"evt_immutable","verified":true}' }
    const original = await recordVerifiedWebhookDelivery(input)
    const claimed = await claimWebhookDelivery(original.id)
    await markWebhookDeliveryProcessed({ provider: input.provider, providerEventId: input.providerEventId, claimToken: claimed!.claimToken! })
    await recordRejectedWebhook({ provider: input.provider, payload: '{"id":"evt_immutable","forged":true}', error: 'Invalid signature' })
    await recordVerifiedWebhookDelivery({ ...input, payload: '{"changed":true}' })
    const persisted = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: original.id } })
    expect(persisted.status).toBe('PROCESSED')
    expect(persisted.rawPayload).toBe(input.payload)
    expect(persisted.attempts).toBe(1)
  })
})

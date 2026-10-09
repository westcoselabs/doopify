import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { enqueueCommerceEvent, dispatchOutboxEvent } from './outbox'
import { claimDueJobs } from '@/server/jobs/job.service'
import { integrationRegistry } from '@/server/integrations/registry'

const suite = process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST ? describe : describe.skip
const payload = { orderId: 'outbox-test', orderNumber: 1, total: 100, currency: 'USD' }
suite('transactional commerce outbox', () => {
  afterEach(async () => {
    await prisma.job.deleteMany({ where: { deduplicationKey: { startsWith: 'order.created:outbox-' } } })
    await prisma.analyticsEvent.deleteMany({ where: { orderId: payload.orderId } })
    await prisma.eventDispatchReceipt.deleteMany({ where: { eventId: { startsWith: 'order.created:outbox-' } } })
  })

  it('rolls back the event with its producer transaction', async () => {
    await expect(prisma.$transaction(async tx => {
      await enqueueCommerceEvent(tx, 'order.created', payload, 'outbox-rollback')
      throw new Error('producer failed')
    })).rejects.toThrow('producer failed')
    expect(await prisma.job.count({ where: { deduplicationKey: 'order.created:outbox-rollback' } })).toBe(0)
  })

  it('recovers consumer failure and post-dispatch crashes without duplicate analytics', async () => {
    const job = await prisma.$transaction(tx => enqueueCommerceEvent(tx, 'order.created', payload, 'outbox-replay'))
    const repeated = await prisma.$transaction(tx => enqueueCommerceEvent(tx, 'order.created', payload, 'outbox-replay'))
    expect(repeated.id).toBe(job.id)
    // Isolate the test job from other integration fixtures without deleting them.
    const [claimed] = (await claimDueJobs(100)).filter(row => row.id === job.id)
    expect(claimed).toBeDefined()
    const claim = { jobId: claimed.id, claimToken: claimed.claimToken! }
    const failure = { event: 'order.created' as const, handle: async () => { throw new Error('consumer failed') } }
    integrationRegistry.push(failure)
    try { await expect(dispatchOutboxEvent(job.payload, claim)).rejects.toThrow('consumer failed') }
    finally { integrationRegistry.splice(integrationRegistry.indexOf(failure), 1) }
    expect(await prisma.analyticsEvent.count({ where: { orderId: payload.orderId } })).toBe(0)
    expect(await prisma.eventDispatchReceipt.count({ where: { eventId: 'order.created:outbox-replay' } })).toBe(0)
    await dispatchOutboxEvent(job.payload, claim)
    // Simulate process death after fan-out committed, before job acknowledgement.
    await prisma.job.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } })
    const [replacement] = (await claimDueJobs(100)).filter(row => row.id === job.id)
    await expect(dispatchOutboxEvent(job.payload, claim)).rejects.toThrow('ownership changed')
    await dispatchOutboxEvent(job.payload, { jobId: replacement.id, claimToken: replacement.claimToken! })
    expect(await prisma.analyticsEvent.count({ where: { orderId: payload.orderId } })).toBe(1)
    expect(await prisma.eventDispatchReceipt.count({ where: { eventId: 'order.created:outbox-replay' } })).toBe(1)
  })
})

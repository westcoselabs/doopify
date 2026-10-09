import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertJobClaim, enqueueJob, type JobClaim } from '@/server/jobs/job.service'
import type { DoopifyEventName, DoopifyEvents } from './types'

export const OUTBOX_JOB_TYPE = 'DISPATCH_INTERNAL_EVENT'

/** Persist in the same transaction as the commerce change. Jobs are the outbox. */
export async function enqueueCommerceEvent<K extends DoopifyEventName>(
  tx: Prisma.TransactionClient, event: K, payload: DoopifyEvents[K], identity: string,
) {
  const eventId = `${event}:${identity}`
  // Event payloads are historical JSON snapshots; strip optional undefined fields.
  return enqueueJob(OUTBOX_JOB_TYPE, JSON.parse(JSON.stringify({ eventId, event, payload })), {
    deduplicationKey: eventId,
  }, tx)
}

export async function dispatchOutboxEvent(input: unknown, claim: JobClaim) {
  if (!input || typeof input !== 'object' || !('eventId' in input) || !('event' in input) || !('payload' in input) || typeof input.eventId !== 'string' || typeof input.event !== 'string') {
    throw new Error('Invalid persisted event envelope')
  }
  const { dispatchPersistedEvent } = await import('./dispatcher')
  await prisma.$transaction(async tx => {
    await assertJobClaim(claim, tx)
    if (await tx.eventDispatchReceipt.findUnique({ where: { eventId: input.eventId as string } })) return
    // Every registry consumer persists through this transaction. No provider I/O.
    await dispatchPersistedEvent(input.event as DoopifyEventName, input.payload as never, { client: tx })
    await tx.eventDispatchReceipt.create({ data: { eventId: input.eventId as string } })
  })
}

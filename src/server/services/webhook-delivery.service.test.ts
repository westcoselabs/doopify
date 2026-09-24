import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({prisma:{webhookDelivery:{upsert:vi.fn(),updateManyAndReturn:vi.fn(),updateMany:vi.fn(),findMany:vi.fn(),findFirst:vi.fn(),findUnique:vi.fn(),count:vi.fn()},checkoutSession:{findUnique:vi.fn()},payment:{findUnique:vi.fn()}},emitInternalEvent:vi.fn()}))
vi.mock('@/lib/prisma',()=>({prisma:mocks.prisma}))
vi.mock('@/server/events/dispatcher',()=>({emitInternalEvent:mocks.emitInternalEvent}))
import {getWebhookDeliveries,getWebhookDeliveryById,getWebhookDeliveryDiagnostics,getDueWebhookDeliveriesForRetry,hashWebhookPayload,MAX_WEBHOOK_DELIVERY_ATTEMPTS,claimWebhookDelivery,claimWebhookDeliveryForRetry,markWebhookDeliveryFailed,markWebhookDeliveryProcessed,recordVerifiedWebhookDelivery,recordRejectedWebhook} from './webhook-delivery.service'
const claim={provider:'stripe',providerEventId:'evt_1',claimToken:'worker-claim'}
const delivery={id:'delivery_1',provider:'stripe',providerEventId:'evt_1',eventType:'payment_intent.succeeded',status:'PROCESSED',attempts:1,claimToken:'worker-claim'}
describe('webhook delivery leases and verified state',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.prisma.webhookDelivery.updateManyAndReturn.mockResolvedValue([delivery]);mocks.prisma.webhookDelivery.findFirst.mockResolvedValue({attempts:1})})
 it('records verified payload once without resetting an existing outcome, retry schedule, or lease',async()=>{
  const payload='{"id":"evt_1"}'
  await recordVerifiedWebhookDelivery({provider:'stripe',providerEventId:'evt_1',eventType:'payment_intent.succeeded',payload})
  expect(mocks.prisma.webhookDelivery.upsert).toHaveBeenCalledWith({where:{provider_providerEventId:{provider:'stripe',providerEventId:'evt_1'}},create:{provider:'stripe',providerEventId:'evt_1',eventType:'payment_intent.succeeded',rawPayload:payload,payloadHash:hashWebhookPayload(payload),status:'RECEIVED',attempts:0},update:{}})
 })
 it('isolates rejected payloads from attacker-supplied canonical event IDs',async()=>{
  const payload='{"id":"evt_existing_paid_order"}'
  await recordRejectedWebhook({provider:'stripe',payload,error:'bad signature'})
  const input=mocks.prisma.webhookDelivery.upsert.mock.calls[0][0]
  expect(input.where.provider_providerEventId).toEqual({provider:'stripe',providerEventId:`invalid:${hashWebhookPayload(payload)}`})
  expect(input.create).toMatchObject({status:'SIGNATURE_FAILED',eventType:'unverified'})
  expect(input.create).not.toHaveProperty('rawPayload')
  expect(input.update).toEqual({})
 })
 it('atomically claims verified due or expired deliveries with an ownership token',async()=>{
  const now=new Date('2026-09-24T00:00:00.000Z')
  expect(await claimWebhookDeliveryForRetry('delivery_1',now)).toEqual(delivery)
  const input=mocks.prisma.webhookDelivery.updateManyAndReturn.mock.calls[0][0]
  expect(input.where).toMatchObject({id:'delivery_1',rawPayload:{not:null},attempts:{lt:MAX_WEBHOOK_DELIVERY_ATTEMPTS},OR:[{status:'RECEIVED',OR:[{claimToken:null},{leaseExpiresAt:{lte:now}}]},{status:'RETRY_PENDING',nextRetryAt:{lte:now},claimToken:null}]})
  expect(input.data).toMatchObject({status:'RECEIVED',attempts:{increment:1},claimToken:expect.any(String),leaseExpiresAt:expect.any(Date),nextRetryAt:null})
  expect(input.data.leaseExpiresAt.getTime()).toBeGreaterThan(now.getTime())
 })
 it('returns no claim when an active owner already won',async()=>{mocks.prisma.webhookDelivery.updateManyAndReturn.mockResolvedValue([]);expect(await claimWebhookDelivery('delivery_1')).toBeNull()})
 it('manual replay still fences active claims and excludes rejected payloads',async()=>{const now=new Date();await claimWebhookDelivery('delivery_1',true,now);expect(mocks.prisma.webhookDelivery.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({where:{id:'delivery_1',rawPayload:{not:null},status:{not:'SIGNATURE_FAILED'},OR:[{claimToken:null},{leaseExpiresAt:{lte:now}}]}}))})
 it('finalizes only the current unexpired claim and releases ownership',async()=>{await markWebhookDeliveryProcessed(claim);expect(mocks.prisma.webhookDelivery.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({where:{...claim,leaseExpiresAt:{gt:expect.any(Date)}},data:expect.objectContaining({status:'PROCESSED',claimToken:null,leaseExpiresAt:null,nextRetryAt:null})}));expect(mocks.emitInternalEvent).toHaveBeenCalledWith('webhook.delivered',expect.objectContaining({providerEventId:'evt_1'}))})
 it('does not emit success for a stale or expired claim',async()=>{mocks.prisma.webhookDelivery.updateManyAndReturn.mockResolvedValue([]);expect(await markWebhookDeliveryProcessed(claim)).toBeNull();expect(mocks.emitInternalEvent).not.toHaveBeenCalled()})
 it.each([[1,true,'RETRY_PENDING'],[MAX_WEBHOOK_DELIVERY_ATTEMPTS,true,'RETRY_EXHAUSTED'],[1,false,'FAILED']])('persists retry policy for attempts %s and retryable %s',async(attempts,retryable,status)=>{mocks.prisma.webhookDelivery.findFirst.mockResolvedValue({attempts});await markWebhookDeliveryFailed({...claim,error:'processing failure',retryable});expect(mocks.prisma.webhookDelivery.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({where:{...claim,leaseExpiresAt:{gt:expect.any(Date)}},data:expect.objectContaining({status,nextRetryAt:status==='RETRY_PENDING'?expect.any(Date):null,claimToken:null,leaseExpiresAt:null})}))})
 it('ignores a failed outcome from a worker that lost its claim',async()=>{mocks.prisma.webhookDelivery.findFirst.mockResolvedValue(null);expect(await markWebhookDeliveryFailed({...claim,error:'stale'})).toBeNull();expect(mocks.prisma.webhookDelivery.updateManyAndReturn).not.toHaveBeenCalled();expect(mocks.emitInternalEvent).not.toHaveBeenCalled()})
 it('does not emit failure after an ownership race between read and update',async()=>{mocks.prisma.webhookDelivery.updateManyAndReturn.mockResolvedValue([]);expect(await markWebhookDeliveryFailed({...claim,error:'stale'})).toBeNull();expect(mocks.emitInternalEvent).not.toHaveBeenCalled()})
 it('makes exhausted crashed workers visible before loading a bounded retry page',async()=>{const now=new Date();mocks.prisma.webhookDelivery.findMany.mockResolvedValue([]);await getDueWebhookDeliveriesForRetry(500,now);expect(mocks.prisma.webhookDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{status:'RECEIVED',attempts:{gte:MAX_WEBHOOK_DELIVERY_ATTEMPTS},leaseExpiresAt:{lte:now}},data:expect.objectContaining({status:'RETRY_EXHAUSTED',claimToken:null,leaseExpiresAt:null})}));expect(mocks.prisma.webhookDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({take:50,select:{id:true},where:expect.objectContaining({rawPayload:{not:null},attempts:{lt:MAX_WEBHOOK_DELIVERY_ATTEMPTS}})}))})
  it('returns paginated webhook deliveries with filters', async () => {
    mocks.prisma.webhookDelivery.findMany.mockResolvedValue([
      {
        id: 'delivery_1',
        provider: 'stripe',
        providerEventId: 'evt_1',
      },
    ])
    mocks.prisma.webhookDelivery.count.mockResolvedValue(1)

    const result = await getWebhookDeliveries({
      provider: 'stripe',
      status: 'FAILED',
      eventType: 'payment_intent.succeeded',
      search: 'evt_1',
      page: 2,
      pageSize: 5,
    })

    expect(mocks.prisma.webhookDelivery.findMany).toHaveBeenCalledWith({
      where: {
        provider: 'stripe',
        status: 'FAILED',
        eventType: 'payment_intent.succeeded',
        OR: [
          { providerEventId: { contains: 'evt_1', mode: 'insensitive' } },
          { lastError: { contains: 'evt_1', mode: 'insensitive' } },
        ],
      },
      select: expect.objectContaining({
        rawPayload: true,
      }),
      orderBy: { updatedAt: 'desc' },
      skip: 5,
      take: 5,
    })
    expect(result.deliveries[0]).toMatchObject({
      hasVerifiedPayload: false,
    })
    expect(result.deliveries[0]).not.toHaveProperty('rawPayload')
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 5,
      total: 1,
      totalPages: 1,
    })
  })

  it('loads a webhook delivery by id', async () => {
    mocks.prisma.webhookDelivery.findUnique.mockResolvedValue({
      id: 'delivery_1',
      provider: 'stripe',
      providerEventId: 'evt_1',
    })

    const delivery = await getWebhookDeliveryById('delivery_1')

    expect(mocks.prisma.webhookDelivery.findUnique).toHaveBeenCalledWith({
      where: { id: 'delivery_1' },
    })
    expect(delivery).toMatchObject({
      id: 'delivery_1',
      provider: 'stripe',
    })
  })

  it('returns diagnostics without exposing the raw payload', async () => {
    mocks.prisma.webhookDelivery.findUnique.mockResolvedValue({
      id: 'delivery_1',
      provider: 'stripe',
      providerEventId: 'evt_1',
      eventType: 'payment_intent.succeeded',
      status: 'RETRY_PENDING',
      attempts: 2,
      processedAt: null,
      lastError: 'Order finalization failed',
      payloadHash: 'hash',
      rawPayload: JSON.stringify({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1',
          },
        },
      }),
      nextRetryAt: new Date('2026-04-28T12:05:00.000Z'),
      lastRetriedAt: null,
      createdAt: new Date('2026-04-28T12:00:00.000Z'),
      updatedAt: new Date('2026-04-28T12:01:00.000Z'),
    })
    mocks.prisma.checkoutSession.findUnique.mockResolvedValue({
      id: 'checkout_1',
      status: 'PENDING',
    })
    mocks.prisma.payment.findUnique.mockResolvedValue(null)

    const diagnostics = await getWebhookDeliveryDiagnostics('delivery_1')

    expect(diagnostics?.delivery).toMatchObject({
      id: 'delivery_1',
      hasVerifiedPayload: true,
    })
    expect(diagnostics?.delivery).not.toHaveProperty('rawPayload')
    expect(diagnostics?.related.paymentIntentId).toBe('pi_1')
    expect(diagnostics?.retryPolicy.canRetry).toBe(true)
  })
})

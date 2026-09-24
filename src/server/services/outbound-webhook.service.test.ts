import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'

const mocks = vi.hoisted(() => ({
  updateManyAndReturn: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), emit: vi.fn(), audit: vi.fn(), secret: vi.fn(),
  destinations: [{ id: 'dest', name: 'Merchant', url: 'https://merchant.example/webhook', events: ['order.paid'], secretEnv: 'OUTBOUND_WEBHOOK_TEST', headers: { 'X-Test': 'OUTBOUND_WEBHOOK_HEADER' } }],
}))
vi.mock('@/lib/prisma', () => ({ prisma: { outboundWebhookDelivery: { updateManyAndReturn: mocks.updateManyAndReturn, createMany: mocks.createMany, findMany: mocks.findMany } } }))
vi.mock('@/lib/env', () => ({ env: { NODE_ENV: 'test' }, getEnvironmentSecret: mocks.secret }))
vi.mock('@/server/config/outbound-webhooks', () => ({ outboundDestinations: mocks.destinations }))
vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: mocks.emit }))
vi.mock('@/server/services/audit-log.service', () => ({ recordAuditLogBestEffort: mocks.audit }))
import { createOutboundWebhookSignature, queueOutboundWebhooks, processOutboundWebhook, processDueOutboundDeliveries, retryOutboundWebhookDelivery } from './outbound-webhook.service'

function delivery(overrides = {}) {
  return { id: 'delivery', integrationId: 'dest', destinationName: 'Merchant', destinationUrl: 'https://merchant.example/webhook', event: 'order.paid', payload: '{"privateCustomerData":true}', status: 'RETRYING', attempts: 1, claimToken: 'claim', ...overrides }
}
function prepare(overrides = {}) {
  mocks.updateManyAndReturn.mockResolvedValueOnce([delivery(overrides)]).mockImplementationOnce(async ({ data }) => [delivery({ ...overrides, ...data })])
}

describe('developer configured outbound delivery', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.secret.mockReturnValue('inert-key'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('OK'))) })

  it('preserves timestamped HMAC wire contract', () => {
    expect(createOutboundWebhookSignature({ payload: 'body', secret: 'key', timestamp: 123 })).toBe('sha256=' + crypto.createHmac('sha256', 'key').update('123.body').digest('hex'))
  })
  it('snapshots destination identity and subscribes without querying configuration', async () => {
    expect(await queueOutboundWebhooks('order.paid', {} as never)).toEqual({ queued: 1 })
    expect(mocks.createMany.mock.calls[0][0].data[0]).toMatchObject({ integrationId: 'dest', destinationName: 'Merchant', destinationUrl: 'https://merchant.example/webhook' })
    expect(await queueOutboundWebhooks('order.refunded', {} as never)).toEqual({ queued: 0 })
  })
  it('sends signed bounded requests and records success with ownership fencing', async () => {
    prepare()
    expect((await processOutboundWebhook('delivery'))?.status).toBe('SUCCESS')
    const options = vi.mocked(fetch).mock.calls[0][1]!
    expect(options).toMatchObject({ redirect: 'error', method: 'POST', signal: expect.any(AbortSignal) })
    expect(options.headers).toMatchObject({ 'X-Doopify-Delivery': 'delivery', 'X-Test': 'inert-key', 'X-Doopify-Signature': expect.stringMatching(/^sha256=/) })
    expect(mocks.updateManyAndReturn.mock.calls[1][0].where).toMatchObject({ id: 'delivery', claimToken: expect.any(String), leaseExpiresAt: { gt: expect.any(Date) } })
    expect(mocks.emit).toHaveBeenCalledWith('webhook.delivered', expect.objectContaining({ deliveryId: 'delivery' }))
  })
  it('never sends a delivery claimed by another worker', async () => {
    mocks.updateManyAndReturn.mockResolvedValue([])
    expect(await processOutboundWebhook('delivery')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not redirect a historical payload when destination configuration changes', async () => {
    prepare({ destinationUrl: 'https://retired.example/webhook' })
    expect((await processOutboundWebhook('delivery'))?.lastError).toContain('snapshot')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses unsigned sends when the referenced environment secret is missing', async () => {
    mocks.secret.mockReturnValue(undefined); prepare()
    expect((await processOutboundWebhook('delivery'))?.lastError).toContain('OUTBOUND_WEBHOOK_TEST')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('schedules failures and exhausts at the attempt limit', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable')); prepare()
    expect((await processOutboundWebhook('delivery'))?.status).toBe('RETRYING')
    prepare({ attempts: 5 })
    expect((await processOutboundWebhook('delivery'))?.status).toBe('EXHAUSTED')
  })
  it('bounds response body consumption and cancels the remaining stream', async () => {
    const cancel = vi.fn()
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(10000))) }, cancel })))
    prepare()
    expect((await processOutboundWebhook('delivery'))?.responseBody).toHaveLength(1000)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('does not report a late worker completion as success', async () => {
    mocks.updateManyAndReturn.mockResolvedValueOnce([delivery()]).mockResolvedValueOnce([])
    expect(await processOutboundWebhook('delivery')).toBeNull()
    expect(mocks.emit).not.toHaveBeenCalled()
  })
  it('reports actual successful sends instead of counting retry outcomes as successes', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'delivery' }]); prepare()
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable'))
    expect(await processDueOutboundDeliveries()).toEqual({ processed: 1, success: 0, failures: 1 })
  })
  it('audits manual retries without returning payload, headers, or claim tokens', async () => {
    prepare()
    const result = await retryOutboundWebhookDelivery('delivery')
    expect(result).toEqual({ id: 'delivery', status: 'SUCCESS', attempts: 1, lastError: null })
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('privateCustomerData')
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('inert-key')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'outbound_webhook.manual_retry' }))
  })
})

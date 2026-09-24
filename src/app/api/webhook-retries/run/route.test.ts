import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({env:{WEBHOOK_RETRY_SECRET:'retry-test-secret'},getDue:vi.fn(),process:vi.fn(),outbound:vi.fn()}))
vi.mock('@/lib/env',()=>({env:mocks.env}))
vi.mock('@/server/services/webhook-delivery.service',()=>({getDueWebhookDeliveriesForRetry:mocks.getDue}))
vi.mock('@/server/services/inbound-webhook-processing.service',()=>({processInboundWebhook:mocks.process}))
vi.mock('@/server/services/outbound-webhook.service',()=>({processDueOutboundDeliveries:mocks.outbound}))
import {POST} from './route'
const request=(headers:Record<string,string>={},limit=5)=>new Request(`http://localhost/api/webhook-retries/run?limit=${limit}`,{method:'POST',headers})
describe('webhook retry runner',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.env.WEBHOOK_RETRY_SECRET='retry-test-secret';mocks.getDue.mockResolvedValue([{id:'first'},{id:'second'}]);mocks.process.mockResolvedValue({status:'PROCESSED'});mocks.outbound.mockResolvedValue({processed:0,results:[]})})
 it('rejects callers before reading or processing deliveries',async()=>{expect((await POST(request())).status).toBe(401);expect(mocks.getDue).not.toHaveBeenCalled();expect(mocks.outbound).not.toHaveBeenCalled()})
 it('fails closed with missing runner config',async()=>{mocks.env.WEBHOOK_RETRY_SECRET='';expect((await POST(request())).status).toBe(503);expect(mocks.getDue).not.toHaveBeenCalled()})
 it.each<Record<string,string>>([{authorization:'Bearer retry-test-secret'},{'x-webhook-retry-secret':'retry-test-secret'}])('accepts the configured runner secret and dispatches claimed processing',async(headers)=>{const response=await POST(request(headers));expect(response.status).toBe(200);expect(mocks.getDue).toHaveBeenCalledWith(5);expect(mocks.process).toHaveBeenCalledWith('first');expect(mocks.process).toHaveBeenCalledWith('second');expect(mocks.outbound).toHaveBeenCalledOnce()})
 it('bounds requested batch size',async()=>{await POST(request({authorization:'Bearer retry-test-secret'},500));expect(mocks.getDue).toHaveBeenCalledWith(50)})
 it('keeps independent retries running when one worker fails unexpectedly',async()=>{mocks.process.mockRejectedValueOnce(new Error('unexpected private error')).mockResolvedValueOnce({status:'PROCESSED'});const response=await POST(request({authorization:'Bearer retry-test-secret'}));const data=(await response.json()).data;expect(response.status).toBe(200);expect(data.results).toEqual([{status:'FAILED',error:'Webhook retry failed'},{status:'PROCESSED'}]);expect(JSON.stringify(data)).not.toContain('unexpected private error');expect(mocks.outbound).toHaveBeenCalledOnce()})
})

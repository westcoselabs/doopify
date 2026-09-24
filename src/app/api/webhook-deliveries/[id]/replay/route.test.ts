import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getDelivery:vi.fn(),process:vi.fn(),audit:vi.fn()}))
vi.mock('@/server/auth/require-auth',()=>({requireAdmin:mocks.requireAdmin}))
vi.mock('@/server/services/webhook-delivery.service',()=>({getWebhookDeliveryById:mocks.getDelivery}))
vi.mock('@/server/services/inbound-webhook-processing.service',()=>({processInboundWebhook:mocks.process}))
vi.mock('@/server/services/audit-log.service',()=>({recordAuditLogBestEffort:mocks.audit,auditActorFromUser:(user:unknown)=>user}))
import {POST} from './route'
const actor={id:'staff',email:'staff@example.org',role:'STAFF'}
const delivery={id:'delivery',provider:'stripe',providerEventId:'evt_1',status:'FAILED',rawPayload:'verified payment payload'}
const invoke=()=>POST(new Request('http://localhost/api/webhook-deliveries/delivery/replay',{method:'POST'}),{params:Promise.resolve({id:'delivery'})})
describe('authenticated manual webhook replay',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.requireAdmin.mockResolvedValue({ok:true,user:actor});mocks.getDelivery.mockResolvedValue(delivery);mocks.process.mockResolvedValue({id:'delivery',status:'PROCESSED',attempts:3})})
 it('checks authorization before looking up or processing a delivery',async()=>{mocks.requireAdmin.mockResolvedValue({ok:false,response:new Response('Forbidden',{status:403})});expect((await invoke()).status).toBe(403);expect(mocks.getDelivery).not.toHaveBeenCalled();expect(mocks.process).not.toHaveBeenCalled()})
 it('returns not found for missing deliveries',async()=>{mocks.getDelivery.mockResolvedValue(null);expect((await invoke()).status).toBe(404);expect(mocks.process).not.toHaveBeenCalled()})
 it.each([{provider:'resend'},{rawPayload:null},{status:'SIGNATURE_FAILED'}])('rejects unverifiable or unsupported deliveries',async(patch)=>{mocks.getDelivery.mockResolvedValue({...delivery,...patch});expect((await invoke()).status).toBe(400);expect(mocks.process).not.toHaveBeenCalled()})
 it('uses the shared lease instead of independently re-running commerce logic',async()=>{const response=await invoke();expect(response.status).toBe(200);expect(mocks.process).toHaveBeenCalledExactlyOnceWith('delivery',true);expect((await response.json()).data).toEqual({id:'delivery',status:'PROCESSED',attempts:3})})
 it('returns conflict when another worker holds the claim',async()=>{mocks.process.mockResolvedValue(null);expect((await invoke()).status).toBe(409);expect(mocks.audit).not.toHaveBeenCalled()})
 it.each([['PROCESSED','inbound_webhook.manual_replay',200],['RETRY_PENDING','inbound_webhook.manual_replay_failed',500]])('audits a %s outcome without payload or claim material',async(status,action,httpStatus)=>{mocks.process.mockResolvedValue({id:'delivery',status,attempts:3});expect((await invoke()).status).toBe(httpStatus);expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({action,actor,resource:{type:'WebhookDelivery',id:'delivery'},snapshot:{deliveryId:'delivery',provider:'stripe',providerEventId:'evt_1',previousStatus:'FAILED',newStatus:status,attemptCount:3},redactions:['raw payload','webhook signature','provider secrets']}));expect(JSON.stringify(mocks.audit.mock.calls[0][0].snapshot)).not.toContain(delivery.rawPayload)})
})

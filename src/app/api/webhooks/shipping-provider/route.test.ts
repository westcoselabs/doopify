import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({verify:vi.fn(),parse:vi.fn(),recordVerified:vi.fn(),recordRejected:vi.fn(),process:vi.fn()}))
vi.mock('@/server/shipping/shipping-tracking-webhook.service',()=>({verifyShippingProviderWebhookSignature:mocks.verify,parseShippingProviderWebhookPayload:mocks.parse}))
vi.mock('@/server/services/webhook-delivery.service',()=>({recordVerifiedWebhookDelivery:mocks.recordVerified,recordRejectedWebhook:mocks.recordRejected,hashWebhookPayload:()=> 'stable-payload-hash'}))
vi.mock('@/server/services/inbound-webhook-processing.service',()=>({processInboundWebhook:mocks.process}))
import {POST} from './route'
const payload=JSON.stringify({id:'evt_existing',event:'track_updated'})
const request=(provider='SHIPPO')=>new Request(`http://localhost/api/webhooks/shipping-provider?provider=${provider}`,{method:'POST',body:payload})
describe('shipping webhook ingress',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.parse.mockReturnValue({providerEventId:'evt_existing',eventType:'track_updated'});mocks.recordVerified.mockResolvedValue({id:'delivery',status:'RECEIVED'});mocks.process.mockResolvedValue({status:'PROCESSED'})})
 it.each([['SHIPPO','shipping.shippo'],['EASYPOST','shipping.easypost']])('verifies %s before recording its canonical delivery',async(provider,name)=>{expect((await POST(request(provider))).status).toBe(200);expect(mocks.verify).toHaveBeenCalledWith({provider,payload,headers:expect.any(Headers)});expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordVerified.mock.invocationCallOrder[0]);expect(mocks.recordVerified).toHaveBeenCalledWith({provider:name,providerEventId:'evt_existing',eventType:'track_updated',payload});expect(mocks.process).toHaveBeenCalledExactlyOnceWith('delivery')})
 it('cannot alter canonical state with a copied event ID and bad signature',async()=>{mocks.verify.mockImplementation(()=>{throw new Error('invalid')});expect((await POST(request())).status).toBe(400);expect(mocks.recordRejected).toHaveBeenCalledWith(expect.objectContaining({provider:'shipping.shippo',payload}));expect(mocks.parse).not.toHaveBeenCalled();expect(mocks.recordVerified).not.toHaveBeenCalled();expect(mocks.process).not.toHaveBeenCalled()})
 it('rejects unknown providers before verification',async()=>{expect((await POST(request('unknown'))).status).toBe(400);expect(mocks.verify).not.toHaveBeenCalled()})
 it('rejects invalid verified payloads',async()=>{mocks.parse.mockReturnValue(null);expect((await POST(request())).status).toBe(400);expect(mocks.recordVerified).not.toHaveBeenCalled()})
 it('uses a stable payload identity when a verified provider event omits its ID',async()=>{mocks.parse.mockReturnValue({eventType:'track_updated',providerEventId:null});await POST(request());expect(mocks.recordVerified).toHaveBeenCalledWith(expect.objectContaining({providerEventId:'payload:stable-payload-hash'}))})
 it('acknowledges processed deliveries without processing again',async()=>{mocks.recordVerified.mockResolvedValue({id:'delivery',status:'PROCESSED'});expect((await POST(request())).status).toBe(200);expect(mocks.process).not.toHaveBeenCalled()})
 it.each([[null,202],[{status:'RETRY_PENDING'},500]])('returns the processing outcome',async(result,status)=>{mocks.process.mockResolvedValue(result);expect((await POST(request())).status).toBe(status)})
})

import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ env: { SHIPPO_API_KEY: 'shippo_private', EASYPOST_API_KEY: undefined as string | undefined }, test: vi.fn(), tracking: vi.fn() }))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/lib/prisma', () => { throw new Error('Provider config cannot import Prisma') })
vi.mock('@/server/utils/crypto', () => { throw new Error('Provider config cannot decrypt data') })
vi.mock('./providers/shippo', () => ({ shippoProviderAdapter: { testConnection: mocks.test, getTrackingStatus: mocks.tracking } }))
vi.mock('./providers/easypost', () => ({ easypostProviderAdapter: {} }))
import { getShippingProviderApiKey, getShippingProviderConnectionStatus, getShippingProviderTrackingStatus, testShippingProviderConnection } from './shipping-provider.service'
describe('environment shipping adapters', () => {
  it('returns presence without calling a provider or exposing its key', () => {
    expect(getShippingProviderApiKey('SHIPPO')).toBe('shippo_private')
    expect(getShippingProviderConnectionStatus('SHIPPO')).toEqual({ provider: 'SHIPPO', hasCredentials: true, connected: true })
    expect(getShippingProviderConnectionStatus('EASYPOST')).toMatchObject({ connected: false })
    expect(mocks.test).not.toHaveBeenCalled()
  })
  it('passes a key only to an explicit provider diagnostic', async () => {
    mocks.test.mockResolvedValue({ ok: true })
    await testShippingProviderConnection('SHIPPO')
    expect(mocks.test).toHaveBeenCalledWith({ apiKey: 'shippo_private' })
  })
  it('keeps tracking bound to the persisted provider and fails if its credentials are absent', async () => {
    await expect(getShippingProviderTrackingStatus({ provider: 'EASYPOST', request: { trackingNumber: 'tracking_1' } })).rejects.toThrow('environment credentials')
  })
})

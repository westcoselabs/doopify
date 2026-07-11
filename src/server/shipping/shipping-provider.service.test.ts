import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    integration: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    integrationSecret: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  encrypt: vi.fn((value: string) => `enc:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
  easypostTestConnection: vi.fn(),
  easypostGetRates: vi.fn(),
  easypostPurchaseLabel: vi.fn(),
  easypostGetTrackingStatus: vi.fn(),
  shippoTestConnection: vi.fn(),
  shippoGetRates: vi.fn(),
  shippoPurchaseLabel: vi.fn(),
  shippoGetTrackingStatus: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/utils/crypto', () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}))
vi.mock('./providers/easypost', () => ({
  easypostProviderAdapter: {
    testConnection: mocks.easypostTestConnection,
    getRates: mocks.easypostGetRates,
    purchaseLabel: mocks.easypostPurchaseLabel,
    getTrackingStatus: mocks.easypostGetTrackingStatus,
  },
}))
vi.mock('./providers/shippo', () => ({
  shippoProviderAdapter: {
    testConnection: mocks.shippoTestConnection,
    getRates: mocks.shippoGetRates,
    purchaseLabel: mocks.shippoPurchaseLabel,
    getTrackingStatus: mocks.shippoGetTrackingStatus,
  },
}))

import {
  connectShippingProvider,
  disconnectShippingProvider,
  getShippingProviderConnectionStatus,
  providerToIntegrationType,
  testShippingProviderConnection,
} from './shipping-provider.service'

describe('shipping provider service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback: any) => callback(mocks.prisma))
  })

  it('maps provider to integration type', () => {
    expect(providerToIntegrationType('EASYPOST')).toBe('SHIPPING_EASYPOST')
    expect(providerToIntegrationType('SHIPPO')).toBe('SHIPPING_SHIPPO')
  })

  it('connects provider credentials using encrypted integration secrets', async () => {
    const connectedIntegration = {
        id: 'int_1',
        providerKey: 'EASYPOST',
        type: 'SHIPPING_EASYPOST',
        status: 'ACTIVE',
        createdAt: new Date('2026-04-29T18:40:00.000Z'),
        updatedAt: new Date('2026-04-29T18:40:00.000Z'),
        secrets: [{ id: 'sec_1', key: 'API_KEY', value: 'enc:ep_test_key' }],
      }
    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([connectedIntegration])
    mocks.prisma.integration.create.mockResolvedValue({ id: 'int_1' })
    mocks.prisma.integrationSecret.upsert.mockResolvedValue({ id: 'sec_1' })

    const status = await connectShippingProvider({
      provider: 'EASYPOST',
      apiKey: 'ep_test_key',
    })

    expect(mocks.encrypt).toHaveBeenCalledWith('ep_test_key')
    expect(mocks.prisma.integrationSecret.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'API_KEY',
          value: 'enc:ep_test_key',
        }),
        update: expect.objectContaining({
          value: 'enc:ep_test_key',
        }),
      })
    )
    expect(status).toMatchObject({
      provider: 'EASYPOST',
      connected: true,
      hasCredentials: true,
    })
  })

  it('disconnects provider and reports inactive status', async () => {
    const activeIntegration = {
        id: 'int_2',
        providerKey: 'SHIPPO',
        type: 'SHIPPING_SHIPPO',
        status: 'ACTIVE',
        createdAt: new Date('2026-04-29T18:41:00.000Z'),
        updatedAt: new Date('2026-04-29T18:41:00.000Z'),
        secrets: [{ id: 'sec_1', key: 'API_KEY', value: 'enc:shippo_test_key' }],
      }
    const inactiveIntegration = {
        id: 'int_2',
        providerKey: 'SHIPPO',
        type: 'SHIPPING_SHIPPO',
        status: 'INACTIVE',
        createdAt: new Date('2026-04-29T18:41:00.000Z'),
        updatedAt: new Date('2026-04-29T18:41:30.000Z'),
        secrets: [{ id: 'sec_1', key: 'API_KEY', value: 'enc:shippo_test_key' }],
      }
    mocks.prisma.integration.findMany
      .mockResolvedValueOnce([activeIntegration])
      .mockResolvedValueOnce([inactiveIntegration])
    mocks.prisma.integration.update.mockResolvedValue({ id: 'int_2', status: 'INACTIVE' })
    mocks.prisma.integration.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.integrationSecret.deleteMany.mockResolvedValue({ count: 1 })

    const status = await disconnectShippingProvider({
      provider: 'SHIPPO',
      clearCredentials: true,
    })

    expect(mocks.prisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'int_2' },
        data: { status: 'INACTIVE' },
      })
    )
    expect(mocks.prisma.integrationSecret.deleteMany).toHaveBeenCalled()
    expect(status).toMatchObject({
      provider: 'SHIPPO',
      integrationStatus: 'INACTIVE',
      connected: false,
    })
  })

  it('tests provider connection using decrypted saved credentials', async () => {
    const integration = {
        id: 'int_1',
        providerKey: 'EASYPOST',
        type: 'SHIPPING_EASYPOST',
        status: 'ACTIVE',
        createdAt: new Date('2026-04-29T18:42:00.000Z'),
        updatedAt: new Date('2026-04-29T18:42:00.000Z'),
        secrets: [{ id: 'sec_1', key: 'API_KEY', value: 'enc:ep_test_key' }],
      }
    mocks.prisma.integration.findMany.mockResolvedValue([integration])
    mocks.easypostTestConnection.mockResolvedValue({
      ok: true,
      message: 'EasyPost connection successful.',
      accountId: 'user_123',
    })

    const payload = await testShippingProviderConnection('EASYPOST')

    expect(mocks.decrypt).toHaveBeenCalledWith('enc:ep_test_key')
    expect(mocks.easypostTestConnection).toHaveBeenCalledWith({
      apiKey: 'ep_test_key',
    })
    expect(payload).toMatchObject({
      provider: 'EASYPOST',
      result: {
        ok: true,
      },
    })
  })

  it('reports disconnected provider when no active credentials exist', async () => {
    mocks.prisma.integration.findMany.mockResolvedValue([{
      id: 'int_3',
      providerKey: 'EASYPOST',
      type: 'SHIPPING_EASYPOST',
      status: 'INACTIVE',
      createdAt: new Date('2026-04-29T18:43:00.000Z'),
      updatedAt: new Date('2026-04-29T18:43:00.000Z'),
      secrets: [],
    }])

    const status = await getShippingProviderConnectionStatus('EASYPOST')
    expect(status).toMatchObject({
      integrationStatus: 'INACTIVE',
      connected: false,
      hasCredentials: false,
    })
  })
})

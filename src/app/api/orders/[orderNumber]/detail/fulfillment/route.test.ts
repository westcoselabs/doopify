import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveOrderIdentifier: vi.fn(),
  getAdminOrderDetailFulfillmentByOrderNumber: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/order-identifier.service', async () => {
  const actual = await vi.importActual<typeof import('@/server/services/order-identifier.service')>(
    '@/server/services/order-identifier.service'
  )
  return {
    ...actual,
    resolveOrderIdentifier: mocks.resolveOrderIdentifier,
  }
})

vi.mock('@/server/services/admin-order-detail.service', () => ({
  getAdminOrderDetailFulfillmentByOrderNumber: mocks.getAdminOrderDetailFulfillmentByOrderNumber,
}))

import { GET } from './route'
import { OrderIdentifierResolutionError } from '@/server/services/order-identifier.service'

describe('GET /api/orders/[orderNumber]/detail/fulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires admin auth', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/fulfillment'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(401)
    expect(mocks.resolveOrderIdentifier).not.toHaveBeenCalled()
  })

  it('returns fulfillment payload', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'ord_1', orderNumber: 1001 })
    mocks.getAdminOrderDetailFulfillmentByOrderNumber.mockResolvedValue({
      fulfillments: [{ id: 'ful_1', status: 'SUCCESS' }],
      shipments: [{ id: 'ful_1', status: 'SUCCESS' }],
      shippingLabels: [],
      shippingCapabilities: {
        labelProvider: 'EASYPOST',
        providerConnected: true,
        connectedProviders: ['EASYPOST'],
        providerConnectionByName: { EASYPOST: true, SHIPPO: false },
        providerUsage: 'LIVE_AND_LABELS',
        canBuyShippingLabel: true,
      },
      emailCapabilities: { hasCustomerEmail: true, providerConfigured: true },
      availableActions: { canBuyShippingLabel: true },
    })

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/fulfillment'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        fulfillments: [{ id: 'ful_1', status: 'SUCCESS' }],
        shipments: [{ id: 'ful_1', status: 'SUCCESS' }],
        shippingLabels: [],
        shippingCapabilities: {
          labelProvider: 'EASYPOST',
          providerConnected: true,
          connectedProviders: ['EASYPOST'],
          providerConnectionByName: { EASYPOST: true, SHIPPO: false },
          providerUsage: 'LIVE_AND_LABELS',
          canBuyShippingLabel: true,
        },
        emailCapabilities: { hasCustomerEmail: true, providerConfigured: true },
        availableActions: { canBuyShippingLabel: true },
      },
    })
  })

  it('returns safe invalid identifier message', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockRejectedValue(
      new OrderIdentifierResolutionError('INVALID_IDENTIFIER', 'Invalid order identifier')
    )

    const response = await GET(new Request('http://localhost/api/orders/not-an-order/detail/fulfillment'), {
      params: Promise.resolve({ orderNumber: 'not-an-order' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid order identifier',
    })
  })

  it('returns 404 when order identifier resolves but fulfillment lookup is missing', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'admin_1', role: 'OWNER' } })
    mocks.resolveOrderIdentifier.mockResolvedValue({ orderId: 'ord_1', orderNumber: 1001 })
    mocks.getAdminOrderDetailFulfillmentByOrderNumber.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/orders/1001/detail/fulfillment'), {
      params: Promise.resolve({ orderNumber: '1001' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Order not found',
    })
  })
})


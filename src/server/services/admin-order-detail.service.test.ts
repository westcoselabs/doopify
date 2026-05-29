import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
    store: {
      findFirst: vi.fn(),
    },
  },
  getShippingProviderConnectionStatus: vi.fn(),
  getRuntimeProviderConnection: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/shipping/shipping-provider.service', () => ({
  getShippingProviderConnectionStatus: mocks.getShippingProviderConnectionStatus,
}))

vi.mock('@/server/services/provider-connection.service', () => ({
  getRuntimeProviderConnection: mocks.getRuntimeProviderConnection,
}))

import { getAdminOrderDetailByOrderNumber } from './admin-order-detail.service'

describe('getAdminOrderDetailByOrderNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.store.findFirst.mockResolvedValue({
      shippingLiveProvider: 'EASYPOST',
      shippingProviderUsage: 'LIVE_AND_LABELS',
      labelProvider: 'EASYPOST',
    })
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'EASYPOST',
    }))
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'runtime',
      credentials: { API_KEY: 're_test_key' },
    })
  })

  it('returns normalized admin detail payload', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'ord_1',
      orderNumber: 1001,
      channel: 'online',
      status: 'OPEN',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      subtotalCents: 5000,
      taxAmountCents: 400,
      shippingAmountCents: 999,
      discountAmountCents: 200,
      totalCents: 6199,
      currency: 'USD',
      email: 'buyer@example.com',
      note: 'Gift note',
      tags: ['vip'],
      createdAt: new Date('2026-04-30T10:00:00.000Z'),
      updatedAt: new Date('2026-04-30T10:00:00.000Z'),
      customer: {
        id: 'cust_1',
        firstName: 'Sam',
        lastName: 'Buyer',
        email: 'buyer@example.com',
        phone: null,
        acceptsMarketing: false,
        tags: [],
        note: null,
        totalSpentCents: 120000,
        orderCount: 5,
        addresses: [{ isDefault: true, address1: '123 Main', city: 'LA', province: 'CA' }],
      },
      items: [
        {
          id: 'item_1',
          productId: 'prod_1',
          variantId: 'var_1',
          title: 'Hoodie',
          variantTitle: 'Large',
          sku: 'SKU-1',
          quantity: 2,
          priceCents: 2500,
          totalCents: 5000,
          totalDiscountCents: 200,
          product: null,
          variant: null,
        },
      ],
      addresses: [
        { type: 'SHIPPING', address1: '123 Main', city: 'LA', province: 'CA' },
        { type: 'BILLING', address1: '500 Bill', city: 'LA', province: 'CA' },
      ],
      payments: [
        {
          id: 'pay_1',
          provider: 'stripe',
          amountCents: 6199,
          currency: 'USD',
          status: 'PAID',
          stripePaymentIntentId: 'pi_1',
          stripeChargeId: null,
          receiptUrl: null,
          createdAt: new Date('2026-04-30T10:00:00.000Z'),
          updatedAt: new Date('2026-04-30T10:00:00.000Z'),
        },
      ],
      fulfillments: [],
      shippingLabels: [],
      events: [
        { id: 'evt_2', type: 'CUSTOMER_NOTE_ADDED', title: 'Customer-visible note added', detail: 'Shipment delayed by weather.', actorType: 'STAFF', actorId: null, createdAt: new Date('2026-04-30T11:00:00.000Z') },
        { id: 'evt_1', type: 'ORDER_PLACED', title: 'Order placed', detail: 'Created', actorType: 'SYSTEM', actorId: null, createdAt: new Date('2026-04-30T10:00:00.000Z') },
      ],
      refunds: [],
      returns: [],
      discountApplications: [
        {
          id: 'app_1',
          discountId: 'disc_1',
          amountCents: 200,
          discount: {
            id: 'disc_1',
            title: 'Spring sale',
            code: 'SPRING10',
            method: 'PERCENTAGE',
          },
        },
      ],
      promotionApplications: [
        {
          id: 'promo_app_1',
          promotionId: 'promo_1',
          nameSnapshot: 'Bundle Promo',
          typeSnapshot: 'PRODUCT_GROUP_DISCOUNT',
          rewardTypeSnapshot: 'PERCENTAGE',
          amountCents: 300,
          lines: [
            {
              id: 'promo_line_1',
              variantId: 'var_1',
              orderItemId: 'item_1',
              quantityDiscounted: 2,
              discountCents: 300,
            },
          ],
        },
      ],
    })

    const detail = await getAdminOrderDetailByOrderNumber(1001)

    expect(detail).toMatchObject({
      id: 'ord_1',
      orderNumber: '#1001',
      paymentStatus: 'paid',
      fulfillmentStatus: 'unfulfilled',
      subtotal: 50,
      shippingAmount: 9.99,
      taxAmount: 4,
      total: 61.99,
      lineItems: [
        expect.objectContaining({
          id: 'item_1',
          price: 25,
          total: 50,
        }),
      ],
      customer: expect.objectContaining({
        id: 'cust_1',
        name: 'Sam Buyer',
      }),
      timeline: [
        expect.objectContaining({
          id: 'evt_2',
          event: 'Customer-visible note added',
        }),
        expect.objectContaining({
          id: 'evt_1',
          event: 'Order placed',
        }),
      ],
      discounts: [
        expect.objectContaining({
          id: 'app_1',
          code: 'SPRING10',
          amount: 2,
        }),
      ],
      promotionApplications: [
        expect.objectContaining({
          id: 'promo_app_1',
          promotionId: 'promo_1',
          name: 'Bundle Promo',
          type: 'PRODUCT_GROUP_DISCOUNT',
          rewardType: 'PERCENTAGE',
          amountCents: 300,
          lineAllocations: [
            expect.objectContaining({
              id: 'promo_line_1',
              variantId: 'var_1',
              orderItemId: 'item_1',
              quantityDiscounted: 2,
              discountCents: 300,
            }),
          ],
        }),
      ],
      customerVisibleNotes: [
        expect.objectContaining({
          id: 'evt_2',
          note: 'Shipment delayed by weather.',
        }),
      ],
      emailCapabilities: {
        hasCustomerEmail: true,
        providerConfigured: true,
      },
    })
    expect(detail?.shippingCapabilities?.connectedProviders).toEqual(['EASYPOST'])
  })

  it('returns null when order does not exist', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(null)
    await expect(getAdminOrderDetailByOrderNumber(9999)).resolves.toBeNull()
  })

  it('keeps label purchase available when order used manual checkout rate and label provider is connected', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'ord_2',
      orderNumber: 1002,
      channel: 'online',
      status: 'OPEN',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      subtotalCents: 5000,
      taxAmountCents: 0,
      shippingAmountCents: 900,
      shippingMethodName: 'Manual economy',
      shippingRateType: 'FLAT',
      shippingProvider: null,
      shippingProviderRateId: null,
      estimatedDeliveryText: '3-5 business days',
      discountAmountCents: 0,
      totalCents: 5900,
      currency: 'USD',
      email: 'buyer@example.com',
      note: null,
      tags: [],
      createdAt: new Date('2026-04-30T10:00:00.000Z'),
      updatedAt: new Date('2026-04-30T10:00:00.000Z'),
      customer: null,
      items: [],
      addresses: [{ type: 'SHIPPING', address1: '123 Main', city: 'LA', province: 'CA' }],
      payments: [],
      fulfillments: [],
      shippingLabels: [],
      events: [],
      refunds: [],
      returns: [],
      discountApplications: [],
    })

    const detail = await getAdminOrderDetailByOrderNumber(1002)
    expect(detail?.shippingMethodName).toBe('Manual economy')
    expect(detail?.shippingProvider).toBeNull()
    expect(detail?.shippingCapabilities).toMatchObject({
      providerConnected: true,
      canBuyShippingLabel: true,
    })
    expect(detail?.availableActions?.canBuyShippingLabel).toBe(true)
  })

  it('derives shipped/delivered status from fulfillment records even when stored status is stale', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      id: 'ord_3',
      orderNumber: 1003,
      channel: 'online',
      status: 'OPEN',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      subtotalCents: 1000,
      taxAmountCents: 0,
      shippingAmountCents: 0,
      discountAmountCents: 0,
      totalCents: 1000,
      currency: 'USD',
      email: 'buyer@example.com',
      note: null,
      tags: [],
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      customer: null,
      items: [
        {
          id: 'item_1',
          productId: null,
          variantId: null,
          title: 'Item',
          variantTitle: null,
          sku: null,
          quantity: 1,
          priceCents: 1000,
          totalCents: 1000,
          totalDiscountCents: 0,
          product: null,
          variant: null,
        },
      ],
      addresses: [],
      payments: [],
      fulfillments: [
        {
          id: 'ful_1',
          status: 'SUCCESS',
          carrier: 'USPS',
          service: 'Priority',
          trackingNumber: 'TRK-1',
          trackingUrl: 'https://track.example/TRK-1',
          labelUrl: null,
          shippedAt: new Date('2026-05-01T11:00:00.000Z'),
          deliveredAt: new Date('2026-05-02T11:00:00.000Z'),
          createdAt: new Date('2026-05-01T11:00:00.000Z'),
          updatedAt: new Date('2026-05-01T11:00:00.000Z'),
          items: [{ id: 'fi_1', orderItemId: 'item_1', variantId: null, quantity: 1 }],
          shippingLabels: [],
        },
      ],
      shippingLabels: [],
      events: [],
      refunds: [],
      returns: [],
      discountApplications: [],
    })

    const detail = await getAdminOrderDetailByOrderNumber(1003)

    expect(detail).toMatchObject({
      fulfillmentStatusRaw: 'FULFILLED',
      shippingStatusRaw: 'DELIVERED',
      shippingStatus: 'Delivered',
      deliveryStatus: 'delivered',
    })
  })
})

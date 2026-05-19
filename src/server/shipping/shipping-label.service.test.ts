import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shippingLabel: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    fulfillment: {
      create: vi.fn(),
    },
    orderEvent: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getStoreSettings: vi.fn(),
  getShippingProviderConnectionStatus: vi.fn(),
  getShippingProviderApiKey: vi.fn(),
  getShippingProviderLiveRates: vi.fn(),
  purchaseShippingProviderLabel: vi.fn(),
  getRuntimeProviderConnection: vi.fn(),
  emitInternalEvent: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettings: mocks.getStoreSettings,
}))

vi.mock('@/server/shipping/shipping-provider.service', () => ({
  getShippingProviderConnectionStatus: mocks.getShippingProviderConnectionStatus,
  getShippingProviderApiKey: mocks.getShippingProviderApiKey,
  getShippingProviderLiveRates: mocks.getShippingProviderLiveRates,
  purchaseShippingProviderLabel: mocks.purchaseShippingProviderLabel,
}))

vi.mock('@/server/events/dispatcher', () => ({
  emitInternalEvent: mocks.emitInternalEvent,
}))

vi.mock('@/server/services/provider-connection.service', () => ({
  getRuntimeProviderConnection: mocks.getRuntimeProviderConnection,
}))

import { buyOrderShippingLabel, getOrderShippingRatesForLabel } from './shipping-label.service'

const baseOrder = {
  id: 'order_1',
  orderNumber: 1001,
  paymentStatus: 'PAID',
  subtotalCents: 5000,
  shippingAmountCents: 999,
  taxAmountCents: 0,
  discountAmountCents: 0,
  totalCents: 5999,
  email: 'buyer@example.com',
  items: [
    { id: 'oi_1', variantId: 'var_1', quantity: 1, priceCents: 5000 },
    { id: 'oi_2', variantId: 'var_2', quantity: 1, priceCents: 3000 },
  ],
  addresses: [
    {
      type: 'SHIPPING',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '555-111-2222',
      address1: '1 Compute Way',
      address2: null,
      city: 'London',
      province: 'LN',
      postalCode: 'N1 1AA',
      country: 'GB',
    },
  ],
  fulfillments: [],
}

const baseStore = {
  id: 'store_1',
  email: 'store@example.com',
  supportEmail: 'support@example.com',
  currency: 'USD',
  shippingLiveProvider: 'EASYPOST',
  shippingProviderUsage: 'LIVE_AND_LABELS',
  shippingOriginName: 'Doopify Warehouse',
  shippingOriginPhone: '555-000-0000',
  shippingOriginAddress1: '10 Origin St',
  shippingOriginAddress2: null,
  shippingOriginCity: 'Austin',
  shippingOriginProvince: 'TX',
  shippingOriginPostalCode: '78701',
  shippingOriginCountry: 'US',
  defaultLabelFormat: 'PDF',
  defaultLabelSize: '4x6',
  shippingLocations: [
    {
      id: 'loc_1',
      name: 'HQ',
      contactName: 'Warehouse',
      company: 'Doopify',
      email: null,
      address1: '10 Origin St',
      address2: null,
      city: 'Austin',
      stateProvince: 'TX',
      postalCode: '78701',
      country: 'US',
      phone: '555-000-0000',
      isDefault: true,
      isActive: true,
    },
  ],
  shippingPackages: [
    {
      id: 'pkg_1',
      name: 'Default Box',
      type: 'BOX',
      length: 10,
      width: 8,
      height: 4,
      dimensionUnit: 'IN',
      emptyPackageWeight: 12,
      weightUnit: 'OZ',
      isDefault: true,
      isActive: true,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.prisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma)
  )

  mocks.getStoreSettings.mockResolvedValue(baseStore)
  mocks.getShippingProviderConnectionStatus.mockResolvedValue({
    provider: 'EASYPOST',
    connected: true,
  })
  mocks.getShippingProviderApiKey.mockResolvedValue('ep_test_key')
  mocks.getRuntimeProviderConnection.mockResolvedValue({
    source: 'runtime',
    credentials: { API_KEY: 're_test_key' },
  })
  mocks.getShippingProviderLiveRates.mockResolvedValue([
    {
      id: 'rate_1',
      source: 'EASYPOST',
      displayName: 'USPS Priority',
      amountCents: 642,
      currency: 'USD',
      providerRateId: 'rate_1',
      metadata: { shipmentId: 'shp_1' },
    },
  ])
  mocks.prisma.shippingLabel.findFirst.mockResolvedValue(null)
  mocks.prisma.fulfillment.create.mockResolvedValue({
    id: 'ful_1',
    trackingNumber: 'TRACK123',
    items: [{ id: 'fi_1', orderItemId: 'oi_1', quantity: 1 }],
  })
  mocks.prisma.shippingLabel.create.mockResolvedValue({
    id: 'label_1',
    orderId: 'order_1',
    providerRateId: 'rate_1',
    labelUrl: 'https://labels.example.com/label_1.pdf',
  })
  mocks.prisma.order.update.mockResolvedValue({})
  mocks.prisma.orderEvent.createMany.mockResolvedValue({ count: 1 })
  mocks.emitInternalEvent.mockResolvedValue(undefined)
})

describe('buyOrderShippingLabel', () => {
  it('creates ShippingLabel and fulfillment without mutating order totals', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerShipmentId: 'shp_1',
      providerRateId: 'rate_1',
      providerLabelId: 'pl_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/label_1.pdf',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://track.example.com/TRACK123',
      labelAmountCents: 642,
      currency: 'USD',
      rawResponse: { ok: true },
    })

    const result = await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
      labelFormat: 'PDF',
      labelSize: '4x6',
    })

    expect(mocks.prisma.shippingLabel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          provider: 'EASYPOST',
          providerRateId: 'rate_1',
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://track.example.com/TRACK123',
          labelAmountCents: 642,
        }),
      })
    )
    expect(mocks.prisma.fulfillment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackingNumber: 'TRACK123',
          trackingUrl: 'https://track.example.com/TRACK123',
        }),
      })
    )
    expect(mocks.prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_1' },
        data: { fulfillmentStatus: 'PARTIALLY_FULFILLED' },
      })
    )
    expect(mocks.prisma.orderEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            orderId: 'order_1',
            type: 'SHIPPING_LABEL_PURCHASED',
            title: 'Shipping label purchased',
          }),
          expect.objectContaining({
            orderId: 'order_1',
            type: 'ORDER_MARKED_SHIPPED',
            title: 'Order marked shipped',
          }),
        ]),
      })
    )
    expect(mocks.prisma.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCents: expect.anything(),
        }),
      })
    )
    expect(result).toMatchObject({
      duplicate: false,
      shippingLabel: { id: 'label_1' },
      fulfillment: { id: 'ful_1' },
    })
  })

  it('rejects label purchase for unpaid orders', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      paymentStatus: 'PENDING',
    })

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow('Labels can only be purchased for paid orders')
  })

  it('does not persist fulfillment/order mutations when provider label purchase fails', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.purchaseShippingProviderLabel.mockRejectedValue(new Error('Provider outage'))

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow('Provider outage')

    expect(mocks.prisma.fulfillment.create).not.toHaveBeenCalled()
    expect(mocks.prisma.shippingLabel.create).not.toHaveBeenCalled()
    expect(mocks.prisma.order.update).not.toHaveBeenCalled()
  })

  it('returns existing shipping label on retry instead of buying a duplicate label', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.prisma.shippingLabel.findFirst.mockResolvedValue({
      id: 'label_existing',
      orderId: 'order_1',
      providerRateId: 'rate_1',
      status: 'PURCHASED',
      fulfillment: { id: 'ful_existing', items: [] },
    })

    const result = await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
    })

    expect(mocks.purchaseShippingProviderLabel).not.toHaveBeenCalled()
    expect(mocks.prisma.fulfillment.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      duplicate: true,
      shippingLabel: { id: 'label_existing' },
    })
  })

  it('passes shipmentId from input directly to purchaseShippingProviderLabel (no rate re-fetch)', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerShipmentId: 'shp_direct',
      providerRateId: 'rate_1',
      providerLabelId: 'pl_2',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/label_2.pdf',
      trackingNumber: 'TRACK456',
      trackingUrl: 'https://track.example.com/TRACK456',
      labelAmountCents: 642,
      currency: 'USD',
      rawResponse: { ok: true },
    })

    await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
      shipmentId: 'shp_original_from_rates_call',
    })

    // Must NOT re-fetch rates from provider (getShippingProviderLiveRates would be called for rate re-fetch)
    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()

    // Must pass the shipmentId exactly as provided (EasyPost needs this for its /buy endpoint)
    expect(mocks.purchaseShippingProviderLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'EASYPOST',
        request: expect.objectContaining({
          rateId: 'rate_1',
          shipmentId: 'shp_original_from_rates_call',
          apiKey: 'ep_test_key',
        }),
      })
    )
  })

  it('buys label without shipmentId when not provided (Shippo path)', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerRateId: 'rate_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/shippo_label.pdf',
      trackingNumber: 'SHIPPO123',
      trackingUrl: 'https://track.example.com/SHIPPO123',
      labelAmountCents: 799,
      currency: 'USD',
      rawResponse: {},
    })

    await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
      // No shipmentId — Shippo does not need it
    })

    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()
    expect(mocks.purchaseShippingProviderLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          rateId: 'rate_1',
          shipmentId: undefined,
        }),
      })
    )
  })

  it('rejects label purchase when no label provider is connected', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockResolvedValue({
      provider: 'EASYPOST',
      connected: false,
    })
    mocks.getShippingProviderApiKey.mockResolvedValue(null)

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow(/not connected|credentials are unavailable|provider/i)

    expect(mocks.purchaseShippingProviderLabel).not.toHaveBeenCalled()
    expect(mocks.prisma.fulfillment.create).not.toHaveBeenCalled()
  })

  it('rejects label purchase when no ship-from location is configured', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      shippingLocations: [],          // no location configured
      shippingOriginAddress1: null,   // no legacy origin either
      shippingOriginCity: null,
      shippingOriginPostalCode: null,
      shippingOriginCountry: null,
    })

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow(/ship-from location|origin|location is required/i)

    expect(mocks.purchaseShippingProviderLabel).not.toHaveBeenCalled()
  })

  it('uses requested provider override when both providers are connected', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: true,
    }))
    mocks.getShippingProviderApiKey.mockImplementation(async (provider: string) =>
      provider === 'SHIPPO' ? 'shippo_test_key' : 'ep_test_key'
    )
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerRateId: 'rate_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/shippo_label.pdf',
      trackingNumber: 'SHIPPO123',
      trackingUrl: 'https://track.example.com/SHIPPO123',
      labelAmountCents: 799,
      currency: 'USD',
      rawResponse: {},
    })

    await buyOrderShippingLabel({
      orderNumber: 1001,
      provider: 'SHIPPO',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
    })

    expect(mocks.purchaseShippingProviderLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
      })
    )
  })

  it('returns tracking email queue metadata for purchased labels', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerShipmentId: 'shp_1',
      providerRateId: 'rate_1',
      providerLabelId: 'pl_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/label_1.pdf',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://track.example.com/TRACK123',
      labelAmountCents: 642,
      currency: 'USD',
      rawResponse: { ok: true },
    })

    const result = await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
      sendTrackingEmail: true,
    })

    expect(mocks.prisma.orderEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'TRACKING_EMAIL_QUEUED',
            title: 'Tracking email queued',
          }),
        ]),
      })
    )
    expect(result).toMatchObject({
      trackingEmail: {
        requested: true,
        queued: true,
        skippedReason: null,
      },
    })
  })

  it('does not rollback label purchase when email provider is unavailable', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      credentials: null,
    })
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerShipmentId: 'shp_1',
      providerRateId: 'rate_1',
      providerLabelId: 'pl_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/label_1.pdf',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://track.example.com/TRACK123',
      labelAmountCents: 642,
      currency: 'USD',
      rawResponse: { ok: true },
    })

    const result = await buyOrderShippingLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
      sendTrackingEmail: true,
    })

    expect(result).toMatchObject({
      duplicate: false,
      trackingEmail: {
        requested: true,
        queued: false,
        skippedReason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      },
    })
    expect(mocks.prisma.shippingLabel.create).toHaveBeenCalled()
    expect(mocks.prisma.fulfillment.create).toHaveBeenCalled()
  })

  it('Shippo rate request uses shipping location email when present', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          email: 'warehouse@example.com',
        },
      ],
    })

    await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      provider: 'SHIPPO',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
        request: expect.objectContaining({
          originAddress: expect.objectContaining({
            email: 'warehouse@example.com',
          }),
        }),
      })
    )
  })

  it('Shippo rate request falls back to support/store email when location email is missing', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      supportEmail: 'support@example.com',
      email: 'store@example.com',
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          email: null,
        },
      ],
    })

    await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      provider: 'SHIPPO',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
        request: expect.objectContaining({
          originAddress: expect.objectContaining({
            email: 'support@example.com',
          }),
        }),
      })
    )
  })

  it('Shippo rate request falls back to store profile phone when location phone is missing', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      phone: '555-222-3333',
      shippingOriginPhone: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          phone: null,
        },
      ],
    })

    await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      provider: 'SHIPPO',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
        request: expect.objectContaining({
          originAddress: expect.objectContaining({
            phone: '555-222-3333',
          }),
        }),
      })
    )
  })

  it('blocks Shippo label flow before provider call when ship-from email is missing everywhere', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      supportEmail: null,
      email: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          email: null,
        },
      ],
    })

    await expect(
      getOrderShippingRatesForLabel({
        orderNumber: 1001,
        provider: 'SHIPPO',
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      })
    ).rejects.toThrow(
      'Shippo requires a ship-from email before buying USPS labels. Add an email to your shipping location or store profile.'
    )

    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()
  })

  it('blocks Shippo rate lookup before provider call when ship-from phone is missing everywhere', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      phone: null,
      shippingOriginPhone: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          phone: null,
          email: 'warehouse@example.com',
        },
      ],
    })

    await expect(
      getOrderShippingRatesForLabel({
        orderNumber: 1001,
        provider: 'SHIPPO',
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      })
    ).rejects.toThrow(
      'Shippo requires a ship-from phone number before buying USPS labels. Add a phone number to your shipping location or store profile.'
    )

    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()
  })

  it('Shippo label purchase falls back to store profile phone when location phone is missing', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      phone: '555-888-9999',
      shippingOriginPhone: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          phone: null,
        },
      ],
    })
    mocks.purchaseShippingProviderLabel.mockResolvedValue({
      providerRateId: 'rate_1',
      carrier: 'USPS',
      service: 'Priority',
      status: 'PURCHASED',
      labelUrl: 'https://labels.example.com/shippo_label.pdf',
      trackingNumber: 'SHIPPO123',
      trackingUrl: 'https://track.example.com/SHIPPO123',
      labelAmountCents: 799,
      currency: 'USD',
      rawResponse: {},
    })

    await buyOrderShippingLabel({
      orderNumber: 1001,
      provider: 'SHIPPO',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      providerRateId: 'rate_1',
    })

    expect(mocks.purchaseShippingProviderLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
        request: expect.objectContaining({
          request: expect.objectContaining({
            originAddress: expect.objectContaining({
              phone: '555-888-9999',
            }),
          }),
        }),
      })
    )
  })

  it('blocks Shippo label purchase before provider call when ship-from phone is missing everywhere', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      phone: null,
      shippingOriginPhone: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          phone: null,
          email: 'warehouse@example.com',
        },
      ],
    })

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        provider: 'SHIPPO',
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow(
      'Shippo requires a ship-from phone number before buying USPS labels. Add a phone number to your shipping location or store profile.'
    )

    expect(mocks.purchaseShippingProviderLabel).not.toHaveBeenCalled()
  })

  it('blocks Shippo label purchase before provider call when ship-from email is missing everywhere', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO',
    }))
    mocks.getShippingProviderApiKey.mockResolvedValue('shippo_test_key')
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      supportEmail: null,
      email: null,
      shippingLocations: [
        {
          ...baseStore.shippingLocations[0],
          email: null,
        },
      ],
    })

    await expect(
      buyOrderShippingLabel({
        orderNumber: 1001,
        provider: 'SHIPPO',
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
        providerRateId: 'rate_1',
      })
    ).rejects.toThrow(
      'Shippo requires a ship-from email before buying USPS labels. Add an email to your shipping location or store profile.'
    )

    expect(mocks.purchaseShippingProviderLabel).not.toHaveBeenCalled()
  })

  it('allows label-rate lookup for paid orders that used manual/flat checkout shipping', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      shippingRateType: 'FLAT',
      shippingProvider: null,
      shippingProviderRateId: null,
      shippingMethodName: 'Manual standard',
    })

    const result = await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(result.provider).toBe('EASYPOST')
    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledTimes(1)
  })

  it('allows label-rate lookup for paid orders that used free checkout shipping', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      shippingRateType: 'FREE',
      shippingProvider: null,
      shippingProviderRateId: null,
      shippingMethodName: 'Free shipping',
      shippingAmountCents: 0,
    })

    const result = await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(result.provider).toBe('EASYPOST')
    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledTimes(1)
  })

  it('allows label-rate lookup with manual parcel input even when no default package is configured', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      shippingPackages: [],
    })

    const result = await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(result.provider).toBe('EASYPOST')
    expect(mocks.getShippingProviderLiveRates).toHaveBeenCalledTimes(1)
  })

  it('fails before provider call when destination postal code is missing', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      addresses: [
        {
          ...baseOrder.addresses[0],
          postalCode: null,
        },
      ],
    })

    await expect(
      getOrderShippingRatesForLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      })
    ).rejects.toThrow(
      'Order shipping address is missing a ZIP/postal code. Correct the shipping address before buying a label.'
    )

    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()
  })

  it('fails before provider call when US destination state/province is missing', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      addresses: [
        {
          ...baseOrder.addresses[0],
          country: 'US',
          province: null,
        },
      ],
    })

    await expect(
      getOrderShippingRatesForLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      })
    ).rejects.toThrow(
      'Order shipping address is missing a state/province. Correct the shipping address before buying a label.'
    )

    expect(mocks.getShippingProviderLiveRates).not.toHaveBeenCalled()
  })

  it('returns actionable safe error when provider returns zero label rates', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getShippingProviderLiveRates.mockResolvedValue([])

    await expect(
      getOrderShippingRatesForLabel({
        orderNumber: 1001,
        items: [{ orderItemId: 'oi_1', quantity: 1 }],
        parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
      })
    ).rejects.toThrow(
      'No label rates returned from EasyPost. Check destination ZIP/postal code, ship-from address, package dimensions, and enabled carriers in your provider account.'
    )
  })

  it('uses labelProvider by default, with explicit override taking precedence', async () => {
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.getStoreSettings.mockResolvedValue({
      ...baseStore,
      activeRateProvider: 'EASYPOST',
      labelProvider: 'SHIPPO',
    })
    mocks.getShippingProviderConnectionStatus.mockImplementation(async (provider: string) => ({
      provider,
      connected: provider === 'SHIPPO' || provider === 'EASYPOST',
    }))
    mocks.getShippingProviderApiKey.mockImplementation(async (provider: string) =>
      provider === 'SHIPPO' ? 'shippo_test_key' : 'ep_test_key'
    )

    await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(mocks.getShippingProviderLiveRates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'SHIPPO',
        request: expect.objectContaining({
          apiKey: 'shippo_test_key',
        }),
      })
    )

    await getOrderShippingRatesForLabel({
      orderNumber: 1001,
      provider: 'EASYPOST',
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      parcel: { weightOz: 12, lengthIn: 10, widthIn: 8, heightIn: 4 },
    })

    expect(mocks.getShippingProviderLiveRates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'EASYPOST',
        request: expect.objectContaining({
          apiKey: 'ep_test_key',
        }),
      })
    )
  })
})

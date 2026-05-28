import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('./OrderAdjustmentsCard', () => ({
  default: () => <div>OrderAdjustmentsCardStub</div>,
}))

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { timezone: 'America/New_York' },
  }),
}))

import OrderDetailView, {
  orderStatusChipTone,
  resolveOrderLabelProviderSelection,
  STORE_DEFAULT_LABEL_PROVIDER_OPTION,
} from './OrderDetailView'

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_1',
    orderNumber: '#1001',
    orderNumberValue: 1001,
    createdAt: '2026-04-30T12:00:00.000Z',
    sourceChannel: 'online',
    paymentStatusRaw: 'PAID',
    fulfillmentStatusRaw: 'UNFULFILLED',
    orderStatus: 'OPEN',
    currency: 'USD',
    subtotal: 50,
    shippingAmount: 10,
    shippingMethodName: 'Standard ground',
    taxAmount: 4,
    discountAmount: 5,
    total: 59,
    shippingCapabilities: {
      connectedProviders: [],
      labelProvider: null,
    },
    availableActions: {
      canBuyShippingLabel: true,
    },
    emailCapabilities: {
      hasCustomerEmail: true,
      providerConfigured: true,
    },
    digitalDelivery: {
      hasDigitalItems: false,
      pending: false,
      grants: [],
    },
    digitalDeliveryLoaded: true,
    discounts: [
      {
        id: 'disc_1',
        title: 'Spring sale',
        code: 'SPRING10',
        method: 'PERCENTAGE',
        amount: 5,
      },
    ],
    lineItems: [
      {
        id: 'item_1',
        title: 'Hoodie',
        variantTitle: 'Large',
        quantity: 2,
        total: 50,
        totalDiscount: 5,
      },
    ],
    fulfillments: [
      {
        id: 'ful_1',
        status: 'SUCCESS',
        carrier: 'UPS',
        service: 'Ground',
        trackingNumber: '1Z1001',
        trackingUrl: 'https://tracking.example.com/1Z1001',
      },
    ],
    shippingLabels: [],
    timeline: [
      {
        id: 'evt_1',
        event: 'Order placed',
        detail: 'Placed from checkout.',
        createdAt: '2026-04-30T12:00:00.000Z',
      },
    ],
    customer: {
      name: 'Sam Buyer',
      email: 'sam@example.com',
      phone: '555-1234',
    },
    notes: 'Gift wrap this order.',
    shippingSummary: {
      address: {
        firstName: 'Sam',
        lastName: 'Buyer',
        address1: '123 Main St',
        city: 'Los Angeles',
        province: 'CA',
        postalCode: '90001',
      },
    },
    billingAddress: {
      firstName: 'Sam',
      lastName: 'Buyer',
      address1: '400 Billing Ave',
      city: 'Los Angeles',
      province: 'CA',
      postalCode: '90001',
    },
    ...overrides,
  }
}

describe('OrderDetailView', () => {
  it('renders loading skeleton while order detail is still loading', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView order={null} isLoading />
    )

    expect(html).toContain('data-testid="order-detail-skeleton"')
    expect(html).not.toContain('Order not found')
  })

  it('renders not-found state only when a true not-found result is provided', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView order={null} isNotFound />
    )

    expect(html).toContain('Order not found')
    expect(html).not.toContain('data-testid="order-detail-skeleton"')
  })

  it('renders fulfillment method selector cards', () => {
    const html = renderToStaticMarkup(<OrderDetailView order={buildOrder()} />)

    expect(html).toContain('Fulfillment method')
    expect(html).toContain('Buy shipping label')
    expect(html).toContain('Add tracking manually')
  })

  it('shows only manual tracking workflow when no provider is connected', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          shippingCapabilities: { connectedProviders: [], labelProvider: null },
        })}
      />
    )

    expect(html).toContain('Add tracking manually')
    expect(html).toContain('Save tracking and mark shipped')
    expect(html).not.toContain('Buy shipping label with Shippo')
    expect(html).not.toContain('Buy shipping label with EasyPost')
  })

  it('shows provider-specific buy-label workflow copy when provider is connected', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          shippingCapabilities: { connectedProviders: ['SHIPPO'], labelProvider: 'SHIPPO' },
        })}
      />
    )

    expect(html).toContain('Buy shipping label with Shippo')
    expect(html).toContain('This can be used even when the customer selected manual, flat, or free shipping at checkout.')
    expect(html).toContain('Get label rates')
    expect(html).not.toContain('Get Shippo label rates')
    expect(html).toContain('Email tracking to customer')
    expect(html).toContain('Label provider')
    expect(html).toContain('Manage providers')
    expect(html).not.toContain('Save tracking and mark shipped')
  })

  it('renders provider selector with store default, EasyPost, and Shippo when both are connected', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          shippingCapabilities: { connectedProviders: ['SHIPPO', 'EASYPOST'], labelProvider: 'EASYPOST' },
        })}
      />
    )

    expect(html).toContain('Store default')
    expect(html).toContain('EasyPost')
    expect(html).toContain('Shippo')
    expect(html).toContain('Store default: EasyPost')
  })

  it('renders shipment card after manual tracking exists', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          shippingLabels: [],
          fulfillments: [
            {
              id: 'ful_manual',
              status: 'SUCCESS',
              carrier: 'FedEx',
              service: 'Home Delivery',
              trackingNumber: 'FDX123',
              trackingUrl: 'https://fedex.example/FDX123',
            },
          ],
        })}
      />
    )

    expect(html).toContain('Shipment')
    expect(html).toContain('Tracking added manually')
    expect(html).toContain('Copy tracking')
    expect(html).toContain('View tracking')
  })

  it('renders shipment card with label details after label purchase', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          fulfillments: [
            {
              id: 'ful_1',
              status: 'SUCCESS',
              carrier: 'USPS',
              service: 'Priority',
              trackingNumber: 'TRACK123',
              trackingUrl: 'https://track.example.com/TRACK123',
            },
          ],
          shippingLabels: [
            {
              id: 'label_1',
              fulfillmentId: 'ful_1',
              provider: 'SHIPPO',
              carrier: 'USPS',
              service: 'Priority',
              trackingNumber: 'TRACK123',
              trackingUrl: 'https://track.example.com/TRACK123',
              labelUrl: 'https://labels.example.com/label_1.pdf',
              labelAmount: 6,
              currency: 'USD',
            },
          ],
        })}
      />
    )

    expect(html).toContain('Label purchased')
    expect(html).toContain('Label cost: $6.00')
    expect(html).toContain('Print label')
  })

  it('labels payment summary shipping line as customer-paid shipping', () => {
    const html = renderToStaticMarkup(<OrderDetailView order={buildOrder()} />)
    expect(html).toContain('Shipping paid by customer')
  })

  it('renders toast viewport so action feedback is not top-banner-only', () => {
    const html = renderToStaticMarkup(<OrderDetailView order={buildOrder()} />)
    expect(html).toContain('toastViewport')
  })

  it('renders order shell sections', () => {
    const html = renderToStaticMarkup(<OrderDetailView order={buildOrder()} />)

    expect(html).toContain('#1001')
    expect(html).toContain('Line items')
    expect(html).toContain('Payment summary')
    expect(html).toContain('Timeline')
    expect(html).toContain('Customer')
    expect(html).toContain('Shipping address')
    expect(html).toContain('Billing address')
    expect(html).toContain('OrderAdjustmentsCardStub')
  })

  it('renders digital delivery card with statuses and action copy for digital grants', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          digitalDelivery: {
            hasDigitalItems: true,
            pending: false,
            grants: [
              {
                grantId: 'grant_active',
                title: 'Active file',
                fileName: 'active.pdf',
                status: 'ACTIVE',
                downloadCount: 1,
                downloadLimit: 5,
                expiresAt: '2099-01-01T00:00:00.000Z',
                lastDownloadedAt: '2026-05-28T09:00:00.000Z',
                deliveryEmailStatus: 'SENT',
                deliveryTokenAvailable: true,
                events: [],
              },
              {
                grantId: 'grant_revoked',
                title: 'Revoked file',
                fileName: 'revoked.pdf',
                status: 'REVOKED',
                downloadCount: 2,
                downloadLimit: 5,
                expiresAt: '2099-01-01T00:00:00.000Z',
                lastDownloadedAt: null,
                deliveryEmailStatus: null,
                deliveryTokenAvailable: true,
                events: [],
              },
              {
                grantId: 'grant_expired',
                title: 'Expired file',
                fileName: 'expired.pdf',
                status: 'EXPIRED',
                downloadCount: 0,
                downloadLimit: 5,
                expiresAt: '2026-01-01T00:00:00.000Z',
                lastDownloadedAt: null,
                deliveryEmailStatus: null,
                deliveryTokenAvailable: true,
                events: [],
              },
              {
                grantId: 'grant_exhausted',
                title: 'Exhausted file',
                fileName: 'exhausted.pdf',
                status: 'EXHAUSTED',
                downloadCount: 5,
                downloadLimit: 5,
                expiresAt: '2099-01-01T00:00:00.000Z',
                lastDownloadedAt: null,
                deliveryEmailStatus: null,
                deliveryTokenAvailable: true,
                events: [],
              },
              {
                grantId: 'grant_pending',
                title: 'Pending file',
                fileName: 'pending.pdf',
                status: 'PENDING',
                downloadCount: 0,
                downloadLimit: 5,
                expiresAt: '2099-01-01T00:00:00.000Z',
                lastDownloadedAt: null,
                deliveryEmailStatus: null,
                deliveryTokenAvailable: false,
                events: [],
              },
            ],
          },
        })}
      />
    )

    expect(html).toContain('Digital delivery')
    expect(html).toContain('Download access for this order.')
    expect(html).toContain('Active')
    expect(html).toContain('Revoked')
    expect(html).toContain('Expired')
    expect(html).toContain('Download limit reached')
    expect(html).toContain('Pending')
    expect(html).toContain('Copy link')
    expect(html).toContain('Resend email')
    expect(html).toContain('Revoke access')
    expect(html).toContain('Regenerate link')
    expect(html).toContain('Regenerating this link will invalidate the previous download URL.')
  })

  it('does not render digital delivery card for physical-only orders', () => {
    const html = renderToStaticMarkup(
      <OrderDetailView
        order={buildOrder({
          digitalDelivery: {
            hasDigitalItems: false,
            pending: false,
            grants: [],
          },
        })}
      />
    )

    expect(html).not.toContain('Digital delivery')
  })

  it('maps status chip tones correctly', () => {
    expect(orderStatusChipTone('PAID')).toBe('success')
    expect(orderStatusChipTone('UNFULFILLED')).toBe('warning')
    expect(orderStatusChipTone('SHIPPED')).toBe('success')
    expect(orderStatusChipTone('PARTIALLY SHIPPED')).toBe('warning')
    expect(orderStatusChipTone('FAILED')).toBe('danger')
    expect(orderStatusChipTone('UNKNOWN_STATE')).toBe('neutral')
  })

  it('builds provider override for selected provider and falls back to store default when requested', () => {
    const explicitProvider = resolveOrderLabelProviderSelection({
      connectedProviders: ['SHIPPO', 'EASYPOST'],
      storeDefaultProvider: 'EASYPOST',
      selectedChoice: 'SHIPPO',
    })
    expect(explicitProvider.selectedProvider).toBe('SHIPPO')
    expect(explicitProvider.providerOverride).toBe('SHIPPO')

    const storeDefault = resolveOrderLabelProviderSelection({
      connectedProviders: ['SHIPPO', 'EASYPOST'],
      storeDefaultProvider: 'EASYPOST',
      selectedChoice: STORE_DEFAULT_LABEL_PROVIDER_OPTION,
    })
    expect(storeDefault.selectedProvider).toBe('EASYPOST')
    expect(storeDefault.providerOverride).toBeUndefined()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  prisma: {
    user: { count: vi.fn() },
    store: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    webhookDelivery: { count: vi.fn() },
    order: { count: vi.fn() },
  },
  getStripeProviderStatus: vi.fn(),
  getRuntimeProviderConnection: vi.fn(),
  getShippingSetupStore: vi.fn(),
  buildShippingSetupStatus: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: mocks.requireOwner,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeProviderStatus: mocks.getStripeProviderStatus,
}))

vi.mock('@/server/services/provider-connection.service', () => ({
  getRuntimeProviderConnection: mocks.getRuntimeProviderConnection,
}))

vi.mock('@/server/shipping/shipping-setup.service', () => ({
  getShippingSetupStore: mocks.getShippingSetupStore,
  buildShippingSetupStatus: mocks.buildShippingSetupStatus,
}))

import { GET } from './route'

describe('GET /api/setup/wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_STORE_URL = 'https://store.example.com'

    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner_1', email: 'owner@example.com', role: 'OWNER' },
    })

    mocks.prisma.user.count.mockResolvedValue(1)
    mocks.prisma.store.findFirst.mockResolvedValue({
      name: 'Doopify Store',
      email: 'owner@example.com',
    })
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod_1',
        title: 'Test Product',
        salesMode: 'STANDARD',
        presaleStartsAt: null,
        presaleEndsAt: null,
        availableForPurchaseAt: null,
        fulfillmentType: 'PHYSICAL',
        media: [],
        variants: [
          {
            priceCents: 2500,
            inventory: 2,
            continueSellingWhenOutOfStock: false,
            weight: 1,
          },
        ],
      },
    ])
    mocks.prisma.webhookDelivery.count.mockResolvedValue(1)
    mocks.prisma.order.count.mockResolvedValue(1)

    mocks.getStripeProviderStatus.mockResolvedValue({
      configured: true,
      verified: true,
      mode: 'test',
      publishableKeyMasked: 'pk_test_••••••1234',
      secretKeyMasked: 'sk_test_••••••5678',
      webhookSecretMasked: 'whsec_••••••9012',
      hasPublishableKey: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      webhookConfigured: true,
      accountId: 'acct_beta',
      chargesEnabled: true,
      payoutsEnabled: false,
      lastVerifiedAt: '2026-05-07T10:00:00.000Z',
      lastError: null,
      source: 'db',
      runtimeSource: 'db',
    })

    mocks.getRuntimeProviderConnection.mockResolvedValue({
      source: 'none',
      provider: 'RESEND',
      verified: false,
      credentials: null,
    })

    mocks.getShippingSetupStore.mockResolvedValue(null)
    mocks.buildShippingSetupStatus.mockResolvedValue(null)
  })

  it('uses db-backed Stripe provider snapshot for connection and webhook readiness', async () => {
    const response = await GET(new Request('http://localhost/api/setup/wizard'))
    expect(response.status).toBe(200)

    const payload = await response.json()
    const steps = payload?.data?.steps || []

    const stripeConnection = steps.find((step: any) => step.id === 'stripe-connection')
    const stripeWebhook = steps.find((step: any) => step.id === 'stripe-webhook')

    expect(stripeConnection?.status).toBe('ready')
    expect(stripeWebhook?.status).toBe('ready')
    expect(stripeWebhook?.reason).toContain('webhook secret is set')
  })
})

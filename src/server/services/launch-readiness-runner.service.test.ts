import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    webhookDelivery: { count: vi.fn() },
    order: { count: vi.fn() },
  },
  getStripeSavedStatusSnapshot: vi.fn(),
  getProviderStatus: vi.fn(),
  getShippingSetupStore: vi.fn(),
  buildShippingSetupStatus: vi.fn(),
  getEmailJobHealthSnapshot: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/server/payments/stripe-runtime.service', () => ({
  getStripeSavedStatusSnapshot: mocks.getStripeSavedStatusSnapshot,
}))
vi.mock('@/server/services/provider-connection.service', () => ({
  getProviderStatus: mocks.getProviderStatus,
}))
vi.mock('@/server/shipping/shipping-setup.service', () => ({
  getShippingSetupStore: mocks.getShippingSetupStore,
  buildShippingSetupStatus: mocks.buildShippingSetupStatus,
}))
vi.mock('@/server/jobs/email-job-health.service', () => ({
  getEmailJobHealthSnapshot: mocks.getEmailJobHealthSnapshot,
}))

import { runLaunchReadinessCheck } from './launch-readiness-runner.service'

function buildBaseFixtures() {
  mocks.prisma.store.findFirst.mockResolvedValue({
    name: 'Doopify Demo',
    email: 'owner@example.com',
    taxEnabled: true,
    defaultTaxRateBps: 750,
  })
  mocks.prisma.product.findMany.mockResolvedValue([
    {
      id: 'prod_1',
      title: 'Test product',
      salesMode: 'STANDARD',
      presaleStartsAt: null,
      presaleEndsAt: null,
      availableForPurchaseAt: null,
      fulfillmentType: 'PHYSICAL',
      media: [{ id: 'media_1' }],
      variants: [{ priceCents: 1200, inventory: 10, continueSellingWhenOutOfStock: false, weight: 1 }],
    },
  ])
  mocks.prisma.webhookDelivery.count.mockResolvedValue(1)
  mocks.prisma.order.count.mockResolvedValue(1)
  mocks.getStripeSavedStatusSnapshot.mockResolvedValue({
    source: 'db',
    configured: true,
    checkoutKeysConfigured: true,
    mode: 'test',
    hasPublishableKey: true,
    hasSecretKey: true,
    hasWebhookSecret: true,
    publishableKeyMasked: 'pk_test_***',
    secretKeyMasked: 'sk_test_***',
    webhookSecretMasked: 'whsec_***',
    lastVerifiedAt: '2026-05-21T00:00:00.000Z',
    lastError: null,
    verificationStatus: 'verified',
  })
  mocks.getShippingSetupStore.mockResolvedValue({ id: 'store_1' })
  mocks.buildShippingSetupStatus.mockResolvedValue({
    providerVerificationStatus: 'verified',
    mode: 'MANUAL',
    canUseManualRates: true,
    canUseLiveRates: false,
  })
  mocks.getEmailJobHealthSnapshot.mockResolvedValue({
    level: 'healthy',
    runner: { health: 'healthy' },
  })
}

describe('runLaunchReadinessCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildBaseFixtures()
  })

  it('degrades provider status errors to warning/unavailable instead of failing the run', async () => {
    mocks.getProviderStatus.mockRejectedValue(new Error('provider status unavailable'))

    const report = await runLaunchReadinessCheck()
    const emailProviderCheck = report.checks.find((check) => check.id === 'email-provider')

    expect(emailProviderCheck).toBeDefined()
    expect(emailProviderCheck?.status).toBe('warning')
    expect(emailProviderCheck?.summary).toContain('temporarily unavailable')
  })

  it('degrades shipping status errors to warning instead of failing the run', async () => {
    mocks.getProviderStatus
      .mockResolvedValueOnce({ source: 'db', hasCredentials: true, state: 'VERIFIED' })
      .mockResolvedValueOnce({ source: 'none', hasCredentials: false, state: 'NOT_CONFIGURED' })
    mocks.buildShippingSetupStatus.mockRejectedValue(new Error('shipping setup status unavailable'))

    const report = await runLaunchReadinessCheck()
    const shippingCheck = report.checks.find((check) => check.id === 'shipping')

    expect(shippingCheck).toBeDefined()
    expect(shippingCheck?.status).toBe('warning')
    expect(shippingCheck?.summary).toContain('temporarily unavailable')
  })
})


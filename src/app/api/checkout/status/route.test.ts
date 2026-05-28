import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCheckoutStatus: vi.fn(),
}))

vi.mock('@/server/services/checkout.service', () => ({
  getCheckoutStatus: mocks.getCheckoutStatus,
}))

import { GET } from './route'

describe('GET /api/checkout/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when payment_intent is missing', async () => {
    const response = await GET(new Request('http://localhost/api/checkout/status'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({
      success: false,
      error: 'payment_intent is required',
    })
    expect(mocks.getCheckoutStatus).not.toHaveBeenCalled()
  })

  it('returns read-only checkout status payload for confirmed orders', async () => {
    mocks.getCheckoutStatus.mockResolvedValue({
      status: 'paid',
      orderNumber: 1001,
      total: 54.99,
      currency: 'USD',
      estimatedDeliveryText: '3-5 business days',
      checkoutStatus: 'COMPLETED',
    })

    const response = await GET(
      new Request('http://localhost/api/checkout/status?payment_intent=pi_status_check')
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      success: true,
      data: {
        status: 'paid',
        orderNumber: 1001,
        total: 54.99,
        currency: 'USD',
        estimatedDeliveryText: '3-5 business days',
        checkoutStatus: 'COMPLETED',
      },
    })
    expect(mocks.getCheckoutStatus).toHaveBeenCalledWith('pi_status_check')
  })

  it('returns 500 when checkout status lookup fails', async () => {
    mocks.getCheckoutStatus.mockRejectedValue(new Error('status unavailable'))

    const response = await GET(
      new Request('http://localhost/api/checkout/status?payment_intent=pi_status_error')
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      success: false,
      error: 'Failed to fetch checkout status',
    })
  })

  it('returns buyer-safe digital download fields without exposing token hash', async () => {
    mocks.getCheckoutStatus.mockResolvedValue({
      status: 'paid',
      orderNumber: 1003,
      total: 24.99,
      currency: 'USD',
      estimatedDeliveryText: 'Digital delivery pending',
      digitalDownloads: [
        {
          fileName: 'Guide.pdf',
          title: 'Guide',
          downloadUrl: '/api/digital-downloads/raw-token',
          expiresAt: '2026-06-27T00:00:00.000Z',
          downloadLimit: 5,
          downloadCount: 0,
        },
      ],
      digitalDownloadsPending: false,
      checkoutStatus: 'COMPLETED',
    })

    const response = await GET(
      new Request('http://localhost/api/checkout/status?payment_intent=pi_digital_status')
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.digitalDownloads).toHaveLength(1)
    expect(JSON.stringify(payload)).not.toContain('tokenHash')
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })
})

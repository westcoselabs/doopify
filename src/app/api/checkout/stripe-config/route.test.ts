import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStripePublicConfig: vi.fn(),
}))

vi.mock('@/lib/stripe-client', () => ({
  getStripePublicConfig: mocks.getStripePublicConfig,
}))

import { GET } from './route'

describe('GET /api/checkout/stripe-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the safe publishable key and mode', async () => {
    mocks.getStripePublicConfig.mockReturnValue({ publishableKey: 'pk_test_public', mode: 'test' })

    const response = await GET()
    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload).toEqual({
      success: true,
      data: {
        publishableKey: 'pk_test_public',
        mode: 'test',
      },
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('sk_test_hidden')
    expect(serialized).not.toContain('whsec_hidden')
  })
})
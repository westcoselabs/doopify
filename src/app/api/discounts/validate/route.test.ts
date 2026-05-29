import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    discount: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import { POST } from './route'

describe('POST /api/discounts/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('remains public and validates an active code using dollar orderTotal input', async () => {
    mocks.prisma.discount.findUnique.mockResolvedValue({
      id: 'disc_1',
      code: 'WELCOME10',
      title: 'Welcome 10',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: 5000,
      usageLimit: null,
      usageCount: 0,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    })

    const response = await POST(
      new Request('http://localhost/api/discounts/validate', {
        method: 'POST',
        body: JSON.stringify({
          code: 'welcome10',
          orderTotal: 50,
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.discount.findUnique).toHaveBeenCalledWith({
      where: { code: 'WELCOME10' },
    })
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.valid).toBe(true)
  })

  it('returns minimum-order errors when subtotal does not meet minimumOrderCents', async () => {
    mocks.prisma.discount.findUnique.mockResolvedValue({
      id: 'disc_1',
      code: 'WELCOME10',
      title: 'Welcome 10',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      minimumOrderCents: 6000,
      usageLimit: null,
      usageCount: 0,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    })

    const response = await POST(
      new Request('http://localhost/api/discounts/validate', {
        method: 'POST',
        body: JSON.stringify({
          code: 'WELCOME10',
          orderTotal: 50,
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Minimum order'),
    })
  })
})

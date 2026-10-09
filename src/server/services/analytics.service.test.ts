import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ order: { groupBy: vi.fn() }, discount: { findMany: vi.fn() }, $queryRaw: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks }))
import { getAnalytics } from './analytics.service'

describe('full-dataset analytics', () => {
  beforeEach(() => { vi.resetAllMocks() })
  it('keeps currency totals, paid/refunded cohort counts, and issued refunds separate', async () => {
    mocks.order.groupBy.mockResolvedValue([
      { currency: 'EUR', _sum: { totalCents: 10000 }, _count: { _all: 4 } },
      { currency: 'USD', _sum: { totalCents: 60000 }, _count: { _all: 30 } },
    ])
    mocks.$queryRaw.mockResolvedValueOnce([{ currency: 'USD', amountCents: BigInt(5000) }]).mockResolvedValueOnce([{ count: BigInt(9) }]).mockResolvedValueOnce([{ id: 'old-product', title: 'Old product', inventory: BigInt(0) }])
    mocks.discount.findMany.mockResolvedValue([{ id: 'old-discount', title: 'Old discount', method: 'PERCENTAGE', usageCount: 400 }])
    const result = await getAnalytics()
    expect(result.currencies).toEqual([
      { currency: 'EUR', paidOrderValueCents: 10000, paidOrderCount: 4, averageOrderValueCents: 2500, refundCents: 0 },
      { currency: 'USD', paidOrderValueCents: 60000, paidOrderCount: 30, averageOrderValueCents: 2000, refundCents: 5000 },
    ])
    expect(result).toMatchObject({ paidOrderCount: 34, repeatCustomers: 9, inventoryPressure: [{ id: 'old-product', inventory: 0 }], topDiscounts: [{ id: 'old-discount', usageCount: 400 }] })
    expect(mocks.order.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } }))
    expect(mocks.discount.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6, orderBy: [{ usageCount: 'desc' }, { id: 'asc' }] }))
    expect(() => JSON.stringify(result)).not.toThrow()
  })
  it('returns an empty report without a synthetic currency or undefined totals', async () => {
    mocks.order.groupBy.mockResolvedValue([]); mocks.$queryRaw.mockResolvedValue([]); mocks.discount.findMany.mockResolvedValue([])
    expect(await getAnalytics()).toEqual({ currencies: [], paidOrderCount: 0, repeatCustomers: 0, inventoryPressure: [], topDiscounts: [] })
  })
})

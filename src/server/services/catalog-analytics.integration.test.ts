import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getAnalytics } from './analytics.service'
import { getStorefrontCollectionByHandle, getStorefrontCollectionSummaries } from './collection.service'
import { getProduct, getStorefrontProducts } from './product.service'
vi.mock('@/server/events/dispatcher', () => ({ emitInternalEvent: vi.fn() }))

const integration = process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST ? describe : describe.skip

integration('catalog pagination and full-dataset analytics with Postgres', () => {
  const prefix = `catalog-${randomUUID()}`
  const productId = (n: number) => `${prefix}-product-${String(n).padStart(3, '0')}`
  const collectionId = `${prefix}-collection`
  let baseline: Awaited<ReturnType<typeof getAnalytics>>

  beforeAll(async () => {
    baseline = await getAnalytics()
    await prisma.product.createMany({ data: Array.from({ length: 62 }, (_, n) => ({
      id: productId(n), handle: `${prefix}-${n}`, title: `${prefix} product ${String(n).padStart(3, '0')}`, tags: [],
      status: n === 61 ? 'DRAFT' : 'ACTIVE', publishedAt: n === 60 ? new Date('2100-01-01') : null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
    })) })
    await prisma.productVariant.createMany({ data: Array.from({ length: 62 }, (_, n) => ({ id: `${prefix}-variant-${n}`, productId: productId(n), title: 'Default', priceCents: 10000 - n * 100, inventory: n, position: 0 })) })
    await prisma.mediaAsset.create({ data: { id: `${prefix}-media`, filename: 'catalog.png', mimeType: 'image/png', size: 1024, data: Buffer.alloc(1024), productMedia: { create: { productId: productId(0), position: 0 } } } })
    await prisma.collection.create({ data: { id: collectionId, title: prefix, handle: prefix, isPublished: true, products: { create: Array.from({ length: 62 }, (_, n) => ({ productId: productId(n), position: n })) } } })
  })

  afterAll(async () => {
    await prisma.refund.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.order.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.customer.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.discount.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.collection.deleteMany({ where: { id: collectionId } })
    await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.mediaAsset.deleteMany({ where: { id: `${prefix}-media` } })
  })

  it('searches beyond the first page, excludes scheduled/draft products, and omits media bytes', async () => {
    const list = await getStorefrontProducts({ search: prefix, page: 3, pageSize: 24 })
    expect(list.pagination).toEqual({ page: 3, pageSize: 24, total: 60, totalPages: 3 })
    expect(list.products).toHaveLength(12)
    const exact = await getStorefrontProducts({ search: `${prefix} product 001` })
    expect(exact.products.map((p) => p.id)).toEqual([productId(1)])
    expect((await getStorefrontProducts({ search: `${prefix} product 060` })).products).toHaveLength(0)
    const product = await getProduct(productId(0))
    expect(product?.media[0]).not.toHaveProperty('data')
    expect(product?.media[0]).not.toHaveProperty('storageKey')
    const summaries = await getStorefrontCollectionSummaries({ pageSize: 100 })
    expect(summaries.collections.find((c) => c.id === collectionId)?.productCount).toBe(60)
  })

  it.each(['MANUAL', 'NEWEST', 'TITLE_ASC', 'PRICE_ASC', 'PRICE_DESC'])('sorts %s across the entire collection before taking a bounded page', async (sortOrder) => {
    await prisma.collection.update({ where: { id: collectionId }, data: { sortOrder } })
    const result = await getStorefrontCollectionByHandle(prefix, { page: 2, pageSize: 7 })
    const descending = sortOrder === 'NEWEST' || sortOrder === 'PRICE_ASC'
    const ids = Array.from({ length: 60 }, (_, n) => productId(descending ? 59 - n : n))
    expect(result?.products.map((p) => p.id)).toEqual(ids.slice(7, 14))
    expect(result?.pagination).toEqual({ page: 2, pageSize: 7, total: 60, totalPages: 9 })
    expect(result).not.toHaveProperty('conditions')
  })

  it('aggregates more than25 paid/refunded orders without mixing currencies or pending refunds', async () => {
    await prisma.customer.create({ data: { id: `${prefix}-customer`, email: `${prefix}@example.test`, tags: [] } })
    await prisma.order.createMany({ data: Array.from({ length: 35 }, (_, n) => ({
      id: `${prefix}-order-${n}`, customerId: `${prefix}-customer`, email: `${prefix}@example.test`, tags: [],
      currency: n < 30 ? 'USD' : 'EUR', totalCents: 1000,
      paymentStatus: n === 34 ? 'PENDING' : n === 33 ? 'FAILED' : n % 3 === 0 ? 'REFUNDED' : n % 3 === 1 ? 'PARTIALLY_REFUNDED' : 'PAID',
    })) })
    await prisma.refund.createMany({ data: [{ id: `${prefix}-refund-issued`, orderId: `${prefix}-order-0`, amountCents: 100, status: 'ISSUED' }, { id: `${prefix}-refund-pending`, orderId: `${prefix}-order-1`, amountCents: 900, status: 'PENDING' }] })
    await prisma.discount.createMany({ data: Array.from({ length: 40 }, (_, n) => ({ id: `${prefix}-discount-${n}`, title: `${prefix} discount${n}`, method: 'PERCENTAGE', value: 10, usageCount: 100000 + n })) })
    const result = await getAnalytics()
    expect(result.paidOrderCount - baseline.paidOrderCount).toBe(33)
    expect(result.repeatCustomers - baseline.repeatCustomers).toBe(1)
    for (const [currency, count] of [['USD', 30], ['EUR', 3]] as const) {
      const before = baseline.currencies.find((c) => c.currency === currency)
      const after = result.currencies.find((c) => c.currency === currency)!
      expect(after.paidOrderValueCents - (before?.paidOrderValueCents ?? 0)).toBe(count * 1000)
      expect(after.paidOrderCount - (before?.paidOrderCount ?? 0)).toBe(count)
      expect(after.averageOrderValueCents).toBe(Math.round(after.paidOrderValueCents / after.paidOrderCount))
      expect(after.refundCents - (before?.refundCents ?? 0)).toBe(currency === 'USD' ? 100 : 0)
    }
    expect(result.topDiscounts[0].id).toBe(`${prefix}-discount-39`)
    expect(result.inventoryPressure).toHaveLength(6)
    expect(JSON.stringify(result)).not.toContain('@example.test')
  })
})

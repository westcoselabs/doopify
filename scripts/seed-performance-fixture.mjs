import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Deliberately restricted to the separately initialized local benchmark cluster.
const url = new URL(process.env.PERFORMANCE_DATABASE_URL || '')
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/doopify_test' || url.searchParams.get('schema') !== 'commerce_perf') {
  throw new Error('Performance fixtures require the isolated loopback commerce_perf target on port 55432.')
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema: 'commerce_perf' }) })
const stamp = new Date('2026-01-01T00:00:00Z')
const id = (kind, index) => `perf-${kind}-${String(index).padStart(5, '0')}`
try {
  if (await prisma.product.count() || await prisma.order.count() || await prisma.user.count()) throw new Error('Fixture schema must be empty; this script never resets a database.')
  await prisma.store.create({ data: { id: 'perf-store', singletonKey: 'PRIMARY', name: 'Doopify Performance Store', email: 'store@example.test', currency: 'USD', country: 'US', shippingMode: 'MANUAL', shippingDomesticRateCents: 499 } })
  await prisma.user.create({ data: { id: 'perf-owner', email: 'performance-owner@example.test', passwordHash: await bcrypt.hash('Doopify-Test-Only-2026!', 12), firstName: 'Performance', lastName: 'Owner', role: 'OWNER', isActive: true, mfaGracePeriodEndsAt: new Date('2100-01-01T00:00:00Z') } })
  await prisma.product.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ id: id('product', i), handle: `performance-product-${i}`, title: `Performance product ${String(i).padStart(4, '0')}`, description: 'Synthetic physical product used only for repeatable local performance measurements.', vendor: 'Fixture vendor', status: 'ACTIVE', tags: [], createdAt: new Date(stamp.getTime() + i * 1000) })) })
  await prisma.productVariant.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ id: id('variant', i), productId: id('product', Math.floor(i / 2)), title: i % 2 ? 'Large' : 'Default', sku: `PERF-${i}`, priceCents: 1000 + (i % 20) * 50, inventory: i % 100, position: i % 2, weight: 1, weightUnit: 'kg' })) })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')
  // Valid small PNG with trailing bytes makes the binary-read cost observable.
  for (let i = 975; i < 1000; i++) {
    const data = Buffer.concat([png, Buffer.alloc(128 * 1024)])
    await prisma.mediaAsset.create({ data: { id: id('media', i), filename: `fixture-${i}.png`, mimeType: 'image/png', size: data.length, width: 1, height: 1, data, productMedia: { create: { productId: id('product', i), position: 0, isFeatured: true } } } })
  }
  await prisma.collection.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ id: id('collection', i), handle: `performance-collection-${i}`, title: `Performance collection ${i}`, isPublished: true, sortOrder: ['MANUAL', 'NEWEST', 'TITLE_ASC', 'PRICE_ASC', 'PRICE_DESC'][i % 5] })) })
  await prisma.collectionProduct.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ collectionId: id('collection', 0), productId: id('product', i), position: i })) })
  await prisma.collectionProduct.createMany({ data: Array.from({ length: 1450 }, (_, i) => ({ collectionId: id('collection', Math.floor(i / 50) + 1), productId: id('product', i % 1000), position: i % 50 })) })
  await prisma.customer.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ id: id('customer', i), email: `customer-${i}@example.test`, firstName: 'Fixture', lastName: String(i), tags: [], orderCount: 20, totalSpentCents: 30000 })) })
  for (let offset = 0; offset < 10000; offset += 1000) {
    await prisma.order.createMany({ data: Array.from({ length: 1000 }, (_, j) => { const i = offset + j; return { id: id('order', i), customerId: id('customer', i % 500), email: `customer-${i % 500}@example.test`, paymentStatus: i % 100 === 0 ? 'REFUNDED' : i % 50 === 0 ? 'PARTIALLY_REFUNDED' : 'PAID', subtotalCents: 1000 + (i % 20) * 50, shippingAmountCents: 499, taxAmountCents: 100, totalCents: 1599 + (i % 20) * 50, currency: i % 10 === 0 ? 'EUR' : 'USD', tags: [], createdAt: new Date(stamp.getTime() + i * 60000) } }) })
    await prisma.orderItem.createMany({ data: Array.from({ length: 1000 }, (_, j) => { const i = offset + j; return { id: id('item', i), orderId: id('order', i), productId: id('product', i % 1000), variantId: id('variant', (i % 1000) * 2), title: `Performance product ${i % 1000}`, priceCents: 1000 + (i % 20) * 50, quantity: 1, totalCents: 1000 + (i % 20) * 50 } }) })
  }
  await prisma.refund.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ id: id('refund', i), orderId: id('order', i * 50), amountCents: i % 2 ? 500 : 1599, status: 'ISSUED' })) })
  await prisma.discount.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ id: id('discount', i), title: `Fixture discount ${i}`, code: `PERF${i}`, method: 'PERCENTAGE', value: 10, usageCount: i * 5 })) })
  for (let i = 0; i < 10; i++) await prisma.promotion.create({ data: { id: id('promotion', i), name: `Fixture promotion ${i}`, status: 'ACTIVE', type: 'PRODUCT_GROUP_DISCOUNT', rewardType: 'PERCENTAGE', value: 10, qualifiers: { create: { productId: id('product', i), variantId: id('variant', i * 2), requiredQuantity: 1 } } } })
  console.log(JSON.stringify({ products: 1000, variants: 2000, paidOrders: 10000, customers: 500, collections: 30, binaryImages: 25, imageBytesEach: png.length + 128 * 1024, promotions: 10 }))
} finally {
  await prisma.$disconnect()
}

import 'server-only'
import { prisma } from '@/lib/prisma'

// Historical paid order value includes discounts, shipping and tax, before refunds.
// Keep the same cohort for order counts and AOV, including subsequently refunded orders.
const paidStatuses = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const

export async function getAnalytics() {
  const [paid, refunds, repeat, inventory, topDiscounts] = await Promise.all([
    prisma.order.groupBy({
      by: ['currency'], where: { paymentStatus: { in: [...paidStatuses] } },
      _sum: { totalCents: true }, _count: { _all: true }, orderBy: { currency: 'asc' },
    }),
    prisma.$queryRaw<Array<{ currency: string; amountCents: bigint }>>`
      SELECT o."currency", COALESCE(SUM(r."amountCents"), 0)::bigint AS "amountCents"
      FROM "refunds" r JOIN "orders" o ON o."id" = r."orderId"
      WHERE r."status" = 'ISSUED' GROUP BY o."currency" ORDER BY o."currency"
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count" FROM (
        SELECT "customerId" FROM "orders"
        WHERE "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND "customerId" IS NOT NULL
        GROUP BY "customerId" HAVING COUNT(*) >= 2
      ) repeat_customers
    `,
    prisma.$queryRaw<Array<{ id: string; title: string; inventory: bigint }>>`
      SELECT p."id", p."title", COALESCE(SUM(v."inventory"), 0)::bigint AS "inventory"
      FROM "products" p LEFT JOIN "product_variants" v ON v."productId" = p."id"
      GROUP BY p."id", p."title" ORDER BY "inventory" ASC, p."title" ASC, p."id" ASC LIMIT 6
    `,
    prisma.discount.findMany({
      select: { id: true, title: true, method: true, usageCount: true },
      orderBy: [{ usageCount: 'desc' }, { id: 'asc' }], take: 6,
    }),
  ])
  const refundByCurrency = new Map(refunds.map((row) => [row.currency, Number(row.amountCents)]))
  const currencies = paid.map((row) => ({
    currency: row.currency,
    paidOrderValueCents: row._sum.totalCents ?? 0,
    paidOrderCount: row._count._all,
    averageOrderValueCents: row._count._all ? Math.round((row._sum.totalCents ?? 0) / row._count._all) : 0,
    refundCents: refundByCurrency.get(row.currency) ?? 0,
  }))
  for (const [currency, refundCents] of refundByCurrency) {
    if (!currencies.some((row) => row.currency === currency)) currencies.push({ currency, paidOrderValueCents: 0, paidOrderCount: 0, averageOrderValueCents: 0, refundCents })
  }
  return {
    currencies: currencies.sort((a, b) => a.currency.localeCompare(b.currency)),
    paidOrderCount: paid.reduce((sum, row) => sum + row._count._all, 0),
    repeatCustomers: Number(repeat[0]?.count ?? 0),
    inventoryPressure: inventory.map((row) => ({ ...row, inventory: Number(row.inventory) })),
    topDiscounts,
  }
}

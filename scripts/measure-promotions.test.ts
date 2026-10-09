import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }))
vi.mock('@/lib/prisma', () => ({ get prisma() { return state.prisma } }))
import { loadAutomaticPromotionsForCheckout } from '../src/server/promotions/checkout-loader.service'
import { evaluatePromotions } from '../src/server/promotions/evaluator'

test('measure the unchanged checkout promotion loader against isolated fixtures', async () => {
  const url = new URL(process.env.PERFORMANCE_DATABASE_URL || '')
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/doopify_test' || url.searchParams.get('schema') !== 'commerce_perf') {
    throw new Error('Benchmark requires isolated commerce_perf on 127.0.0.1:55432.')
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema: 'commerce_perf' }), log: [{ emit: 'event', level: 'query' }] })
  state.prisma = client
  let queries = 0
  client.$on('query', () => { queries++ })
  const prefix = `perf-benchmark-${Date.now()}-`
  const results = []
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
  try {
    const initialCount = await client.promotion.count({ where: { status: 'ACTIVE' } })
    expect(initialCount).toBe(10)
    let created = 0
    for (const count of [10, 100, 1000]) {
      const extra = count - initialCount - created
      if (extra > 0) {
        const data = Array.from({ length: extra }, (_, n) => ({ id: `${prefix}${created + n}`, name: 'Isolated benchmark promotion', status: 'ACTIVE' as const, type: 'PRODUCT_GROUP_DISCOUNT' as const, rewardType: 'PERCENTAGE' as const, value: 10 }))
        await client.promotion.createMany({ data })
        await client.promotionQualifier.createMany({ data: data.map((p, n) => ({ promotionId: p.id, productId: `perf-product-${String((created + n) % 1000).padStart(5, '0')}`, variantId: `perf-variant-${String(((created + n) % 1000) * 2).padStart(5, '0')}`, requiredQuantity: 1 })) })
        created += extra
      }
      for (const cartSize of [1, 10, 50]) {
        const cartLines = Array.from({ length: cartSize }, (_, n) => ({ productId: `perf-product-${String(n).padStart(5, '0')}`, variantId: `perf-variant-${String(n * 2).padStart(5, '0')}`, quantity: 1, unitPriceCents: 1000, fulfillmentType: 'PHYSICAL' as const }))
        const loadMs: number[] = [], evaluateMs: number[] = [], queryCounts: number[] = []
        let payloadBytes = 0
        for (let sample = -3; sample < 25; sample++) {
          queries = 0
          const start = performance.now()
          const loaded = await loadAutomaticPromotionsForCheckout()
          const loadedAt = performance.now()
          evaluatePromotions({ cartLines, promotions: loaded.promotions, currency: 'USD' })
          const evaluatedAt = performance.now()
          expect(loaded.promotions).toHaveLength(count)
          if (sample >= 0) {
            loadMs.push(loadedAt - start); evaluateMs.push(evaluatedAt - loadedAt); queryCounts.push(queries)
            payloadBytes = Buffer.byteLength(JSON.stringify(loaded))
          }
        }
        results.push({ activePromotions: count, cartLines: cartSize, samples: 25, loadP50Ms: percentile(loadMs, .5), loadP95Ms: percentile(loadMs, .95), evaluationP50Ms: percentile(evaluateMs, .5), evaluationP95Ms: percentile(evaluateMs, .95), queryCountMin: Math.min(...queryCounts), queryCountMax: Math.max(...queryCounts), loadedPayloadBytes: payloadBytes })
      }
    }
    const label = process.env.PERFORMANCE_LABEL || 'baseline'
    if (!['baseline', 'after'].includes(label)) throw new Error('Expected baseline or after performance label')
    writeFileSync(`docs/performance/env-only-promotion-${label}.json`, JSON.stringify({ capturedAt: new Date().toISOString(), scope: 'Warm local PostgreSQL, unchanged loader + pure evaluator; no payment/provider calls', results }, null, 2) + '\n')
    console.log(JSON.stringify(results))
  } finally {
    await client.promotion.deleteMany({ where: { id: { startsWith: prefix } } })
    await client.$disconnect()
  }
})

// Representative SELECT plans on the same disposable fixture, outside load runs.
import pg from 'pg'
import { writeFileSync } from 'node:fs'

const client = new pg.Client({ connectionString: 'postgresql://doopify_test@127.0.0.1:55432/doopify_test' })
await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  await client.query('SET LOCAL search_path TO commerce_perf')
  const now = new Date()
  const visible = `p."status" = 'ACTIVE' AND (p."publishedAt" IS NULL OR p."publishedAt" <= $1)`
  const queries = [
    ['navigationLinks', `SELECT c.id, c.title, c.handle FROM collections c WHERE c."isPublished" AND EXISTS (SELECT 1 FROM collection_products cp JOIN products p ON p.id = cp."productId" WHERE cp."collectionId" = c.id AND ${visible}) ORDER BY c."updatedAt" DESC, c.id ASC LIMIT 24`, [now]],
    ['removedNavigationCounts', `SELECT cp."collectionId", count(*) FROM collection_products cp JOIN products p ON p.id = cp."productId" WHERE ${visible} AND cp."collectionId" IN (SELECT id FROM collections WHERE "isPublished" ORDER BY "updatedAt" DESC, id ASC LIMIT 24) GROUP BY cp."collectionId"`, [now]],
    ['productPage', `SELECT p.* FROM products p WHERE ${visible} ORDER BY p."createdAt" DESC, p.id ASC LIMIT 24`, [now]],
    ['productCount', `SELECT count(*) FROM products p WHERE ${visible}`, [now]],
    ['faviconProjection', `SELECT "faviconUrl" FROM stores WHERE "singletonKey" = 'PRIMARY' LIMIT 1`, []],
    ['previousStoreProjection', `SELECT * FROM stores WHERE "singletonKey" = 'PRIMARY' LIMIT 1`, []],
  ]
  const results = []
  for (const [name, sql, values] of queries) {
    const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values)
    results.push({ name, sql, plan: result.rows[0]['QUERY PLAN'][0] })
  }
  await client.query('ROLLBACK')
  writeFileSync('output/p95-query-plans.json', JSON.stringify({ note: 'Representative fixture SQL, not a claim to reproduce every Prisma hydration statement. Run without competing load.', results }, null, 2) + '\n')
  console.log(JSON.stringify(results.map(({ name, plan }) => ({ name, executionMs: plan['Execution Time'], planningMs: plan['Planning Time'], rows: plan.Plan['Actual Rows'], width: plan.Plan['Plan Width'] }))))
} finally { await client.end() }

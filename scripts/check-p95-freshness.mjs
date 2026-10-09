import assert from 'node:assert/strict'
import pg from 'pg'

const client = new pg.Client({ connectionString: 'postgresql://doopify_test@127.0.0.1:55432/doopify_test', options: '-c search_path=commerce_perf' })
const origins = ['http://127.0.0.1:3107', 'http://127.0.0.1:3108']
await client.connect()
const store = (await client.query('SELECT id, name, "faviconUrl" FROM stores WHERE id = $1', ['perf-store'])).rows[0]
const collection = (await client.query('SELECT id, title, "isPublished", "updatedAt" FROM collections WHERE id = $1', ['perf-collection-00000'])).rows[0]
try {
  assert.equal(store?.name, 'Doopify Performance Store')
  assert.ok(collection)
  for (const marker of ['before', 'after']) {
    const title = `P95 freshness ${marker}`
    const favicon = `/p95-${marker}.ico`
    await client.query('UPDATE stores SET "faviconUrl" = $1 WHERE id = $2', [favicon, store.id])
    await client.query('UPDATE collections SET title = $1, "updatedAt" = now() WHERE id = $2', [title, collection.id])
    for (const origin of origins) {
      const response = await fetch(`${origin}/shop`)
      assert.equal(response.status, 200)
      const html = await response.text()
      assert.ok(html.includes(title), 'The next request must contain the current collection title')
      assert.ok(html.includes(`href="${favicon}"`), 'The next request must contain the current favicon')
    }
  }
  await client.query('UPDATE collections SET "isPublished" = false WHERE id = $1', [collection.id])
  for (const origin of origins) {
    assert.equal((await fetch(`${origin}/collections/performance-collection-0`)).status, 404)
    const html = await (await fetch(`${origin}/shop`)).text()
    assert.ok(!html.includes('P95 freshness after'), 'Unpublished navigation must disappear immediately')
    const privatePage = await fetch(`${origin}/admin/settings/shipping`, { redirect: 'manual' })
    assert.equal(privatePage.status, 307)
    assert.ok(privatePage.headers.get('location')?.includes('/login'))
    const publicApi = await (await fetch(`${origin}/api/storefront/collections`)).json()
    assert.equal(publicApi.success, true)
    assert.ok(publicApi.data.pagination)
    assert.ok(publicApi.data.collections.every(row => 'productCount' in row && 'imageUrl' in row))
  }
  console.log(JSON.stringify({ freshTitleAndFaviconAcrossReplicas: true, publicationBoundary: true, anonymousSettingsDenied: true, fullCollectionApiPreserved: true }))
} finally {
  if (store?.id === 'perf-store') await client.query('UPDATE stores SET "faviconUrl" = $1 WHERE id = $2', [store.faviconUrl, store.id])
  if (collection?.id === 'perf-collection-00000') await client.query('UPDATE collections SET title = $1, "isPublished" = $2, "updatedAt" = $3 WHERE id = $4', [collection.title, collection.isPublished, collection.updatedAt, collection.id])
  await client.end()
}

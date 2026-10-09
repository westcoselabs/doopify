import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getStorefrontCollectionLinks } from './collection.service'
import { getStorefrontDocumentSettings } from './settings.service'

const integration = process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST ? describe : describe.skip

integration('fresh storefront navigation reads with Postgres', () => {
  const prefix = `navigation-${randomUUID()}`
  const id = (name: string) => `${prefix}-${name}`
  const published = new Date('2020-01-01')
  const newer = new Date('2026-01-02')
  beforeAll(async () => {
    await prisma.product.createMany({ data: [
      { id: id('visible'), handle: id('visible'), title: 'Visible', status: 'ACTIVE', publishedAt: published, tags: [] },
      { id: id('future'), handle: id('future'), title: 'Scheduled', status: 'ACTIVE', publishedAt: new Date('2100-01-01'), tags: [] },
      { id: id('draft'), handle: id('draft'), title: 'Draft', status: 'DRAFT', tags: [] },
    ] })
    for (const [name, product] of [['a', 'visible'], ['b', 'visible'], ['future', 'future'], ['draft', 'draft'], ['hidden', 'visible'], ['empty', null]] as const) {
      await prisma.collection.create({ data: {
        id: id(name), handle: id(name), title: name, isPublished: name !== 'hidden', updatedAt: name === 'b' ? newer : published,
        ...(product ? { products: { create: { productId: id(product), position: 0 } } } : {}),
      } })
    }
  })
  afterAll(async () => {
    await prisma.collection.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } })
    await prisma.store.deleteMany({ where: { id: { startsWith: prefix } } })
  })

  it('returns only visible nonempty links, in the existing order with exclusions and limits', async () => {
    const links = await getStorefrontCollectionLinks({ limit: 100 })
    expect(links.filter(link => link.id.startsWith(prefix))).toEqual([
      { id: id('b'), title: 'b', handle: id('b') }, { id: id('a'), title: 'a', handle: id('a') },
    ])
    const limited = await getStorefrontCollectionLinks({ limit: 1 })
    expect(limited).toHaveLength(1)
    const excluded = await getStorefrontCollectionLinks({ limit: 100, excludeHandle: id('b') })
    expect(excluded.some(link => link.id === id('b'))).toBe(false)
  })

  it('reflects publication and title changes on the very next read', async () => {
    await prisma.collection.update({ where: { id: id('a') }, data: { title: 'Changed now' } })
    expect((await getStorefrontCollectionLinks({ limit: 100 })).find(link => link.id === id('a'))?.title).toBe('Changed now')
    await prisma.product.update({ where: { id: id('future') }, data: { publishedAt: published } })
    expect((await getStorefrontCollectionLinks({ limit: 100 })).some(link => link.id === id('future'))).toBe(true)
    await prisma.collection.update({ where: { id: id('a') }, data: { isPublished: false } })
    expect((await getStorefrontCollectionLinks({ limit: 100 })).some(link => link.id === id('a'))).toBe(false)
  })

  it('keeps missing-store, deterministic legacy fallback and immediate favicon updates', async () => {
    // This suite runs against the isolated freshly reset integration schema.
    expect(await prisma.store.count()).toBe(0)
    expect(await getStorefrontDocumentSettings()).toBeNull()
    await prisma.store.create({ data: { id: id('store'), name: 'Legacy store', singletonKey: null, faviconUrl: '/old.ico' } })
    expect(await getStorefrontDocumentSettings()).toEqual({ faviconUrl: '/old.ico' })
    await prisma.store.update({ where: { id: id('store') }, data: { singletonKey: 'PRIMARY', faviconUrl: '/new.ico' } })
    expect(await getStorefrontDocumentSettings()).toEqual({ faviconUrl: '/new.ico' })
    await prisma.store.update({ where: { id: id('store') }, data: { faviconUrl: null } })
    expect(await getStorefrontDocumentSettings()).toEqual({ faviconUrl: null })
  })
})

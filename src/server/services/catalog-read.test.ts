import { describe, expect, it } from 'vitest'
import { catalogPagination, catalogMediaSelect, storefrontVisibleProductWhere } from './catalog-read'

describe('catalog read boundaries', () => {
  it.each([NaN, Infinity, -5, 0, 'bad'])('normalizes invalid page values: %s', (page) => {
    expect(catalogPagination({ page, pageSize: page })).toEqual({ page: 1, pageSize: 24 })
  })
  it('bounds and truncates valid pages', () => {
    expect(catalogPagination({ page: 2.9, pageSize: 900 })).toEqual({ page: 2, pageSize: 100 })
  })
  it('excludes stored media data and storage internals', () => {
    expect(catalogMediaSelect).not.toHaveProperty('data')
    expect(catalogMediaSelect).not.toHaveProperty('storageKey')
    expect(catalogMediaSelect).not.toHaveProperty('storageBucket')
  })
  it('uses a single publication boundary for all storefront reads', () => {
    const now = new Date('2026-09-01')
    expect(storefrontVisibleProductWhere(now)).toEqual({ status: 'ACTIVE', OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] })
  })
})

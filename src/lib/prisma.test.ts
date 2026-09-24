import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/env', () => ({ env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/unused' } }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }))
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }))
import { normalizePgConnectionString } from './prisma'

describe('Postgres schema normalization', () => {
  it('preserves existing startup options and aligns raw SQL with the Prisma schema', () => {
    const url = new URL(normalizePgConnectionString('postgresql://localhost/test?options=-c%20statement_timeout%3D5000&sslmode=require', 'commerce_perf'))
    expect(url.searchParams.get('options')).toBe('-c statement_timeout=5000 -c search_path="commerce_perf"')
    expect(url.searchParams.get('sslmode')).toBe('verify-full')
  })
  it('quotes identifiers and escapes startup-option separators', () => {
    const url = new URL(normalizePgConnectionString('postgresql://localhost/test', 'schema "quoted"\\name'))
    expect(url.searchParams.get('options')).toBe('-c search_path="schema\\ ""quoted""\\\\name"')
  })
})

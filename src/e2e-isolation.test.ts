import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('E2E database isolation', () => {
  it('requires a dedicated test database before Playwright starts a server', () => {
    const config = read('playwright.config.mjs')

    expect(config).toContain('DATABASE_URL_TEST configured for disposable storage')
    expect(config).toContain('DATABASE_URL_TEST must not match DATABASE_URL')
    expect(config).toContain('dedicated non-public schema')
    expect(config).toContain('DATABASE_URL: databaseUrlTest')
  })

  it('keeps mutation-capable E2E specs from reading the normal .env database', () => {
    for (const spec of [
      'tests/e2e/smart-promotions-admin.spec.ts',
      'tests/e2e/digital-order-polish-snapshots.spec.ts',
    ]) {
      const source = read(spec)
      expect(source).toContain('DATABASE_URL_TEST is required for mutation-capable E2E tests.')
      expect(source).not.toContain("readFileSync(envPath")
      expect(source).not.toContain("process.env.DATABASE_URL = readEnvValue")
    }
  })
})

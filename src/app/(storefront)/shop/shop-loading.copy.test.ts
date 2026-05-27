import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('shop loading-state clarity copy', () => {
  it('uses explicit loading copy instead of an ambiguous count placeholder', () => {
    const source = read('src/app/(storefront)/shop/page.js')

    expect(source).toContain('Loading products...')
    expect(source).toContain('Syncing live catalog inventory and prices.')
    expect(source).toContain('Loading catalog')
    expect(source).toContain('Products will appear here as soon as availability checks finish.')
  })
})

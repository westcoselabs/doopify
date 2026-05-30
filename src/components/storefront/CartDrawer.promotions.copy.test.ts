import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Cart drawer promotion visibility copy', () => {
  it('uses a safe checkout note instead of local promotion discount calculations', () => {
    const source = read('src/components/storefront/CartDrawer.js')

    expect(source).toContain('Automatic promotions are calculated at checkout.')
    expect(source).not.toContain('promotionApplications')
    expect(source).not.toContain('promotionDiscountAmountCents')
  })
})

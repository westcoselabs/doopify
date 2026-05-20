import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('product selling tab contract', () => {
  it('keeps the product editor tab order with Selling between Media and Variants', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/products/ProductEditorDrawer.js'),
      'utf8'
    )

    const mediaIndex = source.indexOf('id: "media"')
    const sellingIndex = source.indexOf('id: "selling"')
    const variantsIndex = source.indexOf('id: "variants"')

    expect(mediaIndex).toBeGreaterThan(-1)
    expect(sellingIndex).toBeGreaterThan(mediaIndex)
    expect(variantsIndex).toBeGreaterThan(sellingIndex)
  })

  it('includes selling panel copy for read-only inventory and variant handoff', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/products/ProductSellingPanel.js'),
      'utf8'
    )

    expect(source).toContain('Inventory summary')
    expect(source).toContain('Read-only here to avoid duplicate inventory controls.')
    expect(source).toContain('Manage in Variants')
    expect(source).toContain('Presale inventory rule check')
  })

  it('keeps continue-selling controls inside the variants editor', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.js'),
      'utf8'
    )

    expect(source).toContain('Continue selling when out of stock')
    expect(source).toContain("'continueSellingWhenOutOfStock'")
    expect(source).toContain('ariaLabel="Continue selling when out of stock"')
  })
})

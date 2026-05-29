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

  it('keeps digital fulfillment copy aligned with live delivery while preserving admin controls', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/products/ProductSellingPanel.js'),
      'utf8'
    )

    expect(source).toContain('No shipping required. Buyers receive secure download links after payment.')
    expect(source).toContain('Digital delivery is active for this product')
    expect(source).toContain('Customers receive secure download links on the checkout success page and by email.')
    expect(source).toContain('No shipping is required. Customers receive secure download links after payment.')
    expect(source).toContain('onClick={() => actions.setDraftField("fulfillmentType", mode.value)}')
    expect(source).toContain('Linked digital assets')
    expect(source).toContain('No digital files linked yet')
    expect(source).toContain('Upload private files and link them to this product.')
    expect(source).toContain('Upload digital file')
    expect(source).toContain('application/pdf,application/zip,image/png,image/jpeg,text/plain')
    expect(source).toContain('Link asset')
    expect(source).toContain('Unlink')
    expect(source).not.toContain('badge = "Digital"')
    expect(source).not.toContain('tokenHash')
    expect(source).not.toContain('tokenEnc')
    expect(source).not.toContain('storageKey')
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

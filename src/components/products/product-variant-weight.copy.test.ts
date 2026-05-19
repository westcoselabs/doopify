import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('product variant weight UI contract', () => {
  it('uses the shared admin select pattern for weight units instead of native select', () => {
    const sourcePath = path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.js')
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain('className={`admin-input ${styles.weightInput}`}')
    expect(source).toContain('import AdminSelect from')
    expect(source).toContain('<WeightUnitSelect')
    expect(source).not.toContain('<select')
  })

  it('keeps supported weight units visible for oz/lb/g/kg', () => {
    const sourcePath = path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.js')
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain("const WEIGHT_UNIT_OPTIONS = ['g', 'kg', 'oz', 'lb'];")
  })

  it('includes accessible labels and keeps unit control container visible', () => {
    const sourcePath = path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.js')
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain('ariaLabel={`Weight unit for ${variant.title || \'variant\'}`}')
    expect(source).toContain('ariaLabel="Weight unit for default variant"')
  })

  it('keeps weight unit control width and overflow safe for narrow drawers', () => {
    const cssPath = path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.module.css')
    const css = fs.readFileSync(cssPath, 'utf8')

    expect(css).toContain('overflow: visible;')
    expect(css).toContain('overflow-x: auto;')
    expect(css).toContain('width: 5rem;')
    expect(css).toContain('min-width: 5rem;')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(css).toContain('.variantSkuCell {')
    expect(css).toContain('flex-direction: column;')
  })

  it('renders polished default-variant copy and grouped inventory/shipping labels', () => {
    const sourcePath = path.resolve(process.cwd(), 'src/components/products/ProductVariantEditor.js')
    const source = fs.readFileSync(sourcePath, 'utf8')

    expect(source).toContain('Default variant')
    expect((source.match(/>Quantity available</g) || []).length).toBe(1)
    expect(source).toContain('Used for shipping rates and label calculations.')
    expect(source).toContain('Inventory tracking enabled')
    expect(source).toContain('Add option')
  })

  it('keeps product save payload wiring for variant weight and unit fields', () => {
    const contextPath = path.resolve(process.cwd(), 'src/context/ProductContext.js')
    const contextSource = fs.readFileSync(contextPath, 'utf8')

    expect(contextSource).toContain('weight: v.weight != null ? Number(v.weight) : undefined')
    expect(contextSource).toContain('weightUnit: v.weightUnit || undefined')
  })
})

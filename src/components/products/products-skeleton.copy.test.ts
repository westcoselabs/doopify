import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('products skeleton loader', () => {
  it('uses a products-specific table row skeleton instead of a generic table block', () => {
    const source = read('src/components/products/ProductCatalog.js')

    expect(source).toContain('function ProductCatalogTableSkeleton')
    expect(source).toContain('data-testid="products-catalog-skeleton"')
    expect(source).toContain("viewState === 'loading' ? <ProductCatalogTableSkeleton rows={6} /> : null")
    expect(source).not.toContain("<AdminSkeleton rows={6} variant=\"table\" />")
  })

  it('defines row, thumb, and chip skeleton styles to match product table layout', () => {
    const css = read('src/components/products/ProductCatalog.module.css')

    expect(css).toContain('.catalogSkeletonRow')
    expect(css).toContain('.catalogSkeletonThumb')
    expect(css).toContain('.catalogSkeletonChip')
    expect(css).toContain('.catalogSkeletonAction')
    expect(css).toContain('@keyframes catalogPulse')
  })
})


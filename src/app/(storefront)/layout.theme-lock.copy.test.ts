import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const LAYOUT = 'src/app/(storefront)/layout.js'
const SETTINGS_SERVICE = 'src/server/services/settings.service.ts'
const CHECKOUT_PAGE = 'src/app/(storefront)/checkout/CheckoutClientPage.tsx'

describe('storefront beta theme lock behavior', () => {
  it('keeps favicon/logo identity support without backend-driven CSS token overrides', () => {
    const source = read(LAYOUT)

    expect(source).toContain('getStorefrontDocumentSettings')
    expect(source).toContain('store?.faviconUrl')
    expect(source).not.toContain("'--store-primary'")
    expect(source).not.toContain("'--brand-primary'")
    expect(source).not.toContain('resolveFontStack')
    expect(source).not.toContain('resolveButtonRadiusCss')
  })

  it('keeps public storefront settings payload backwards compatible for future theming fields', () => {
    const source = read(SETTINGS_SERVICE)

    expect(source).toContain('primaryColor: brandKit.primaryColor')
    expect(source).toContain('secondaryColor: brandKit.secondaryColor')
    expect(source).toContain('accentColor: brandKit.accentColor')
    expect(source).toContain('textColor: brandKit.textColor')
    expect(source).toContain('headingFont: brandKit.headingFont')
    expect(source).toContain('bodyFont: brandKit.bodyFont')
    expect(source).toContain('buttonRadius: brandKit.buttonRadius')
    expect(source).toContain('buttonStyle: brandKit.buttonStyle')
    expect(source).toContain('buttonTextTransform: brandKit.buttonTextTransform')
  })

  it('keeps checkout/storefront identity fallbacks for logo and store name', () => {
    const source = read(CHECKOUT_PAGE)

    expect(source).toContain("return store?.checkoutLogoUrl || store?.logoUrl || '';")
    expect(source).toContain("alt={store?.name || 'Doopify'}")
    expect(source).toContain("store?.name || 'Doopify'")
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd())

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

describe('dashboard route data scoping', () => {
  it('keeps data-fetching providers out of the dashboard layout', () => {
    const layout = read('src/app/(dashboard)/layout.js')

    expect(layout).not.toContain('SettingsProvider')
    expect(layout).not.toContain('ProductsProvider')
    expect(layout).not.toContain('OrdersProvider')
    expect(layout).not.toContain('CustomersProvider')
    expect(layout).not.toContain('DiscountsProvider')
    expect(layout).toContain('<AdminThemeProvider>')
    expect(layout).toContain('<AdminCommandPalette />')
  })

  it('mounts each domain provider only from the route that needs it', () => {
    expect(read('src/app/(dashboard)/orders/page.js')).toContain('<DashboardRouteProviders orders>')
    expect(read('src/app/(dashboard)/customers/page.js')).toContain('<DashboardRouteProviders customers>')
    expect(read('src/app/(dashboard)/discounts/page.js')).toContain('<DashboardRouteProviders discounts>')
    expect(read('src/app/(dashboard)/analytics/page.js')).toContain(
      '<DashboardRouteProviders customers discounts orders products>'
    )
  })
})

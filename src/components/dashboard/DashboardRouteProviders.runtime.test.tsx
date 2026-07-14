import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

const initialized: string[] = []

function provider(name: string) {
  return function TestProvider({ children }: { children: ReactNode }) {
    initialized.push(name)
    return <>{children}</>
  }
}

vi.mock('@/context/CustomersContext', () => ({ CustomersProvider: provider('customers') }))
vi.mock('@/context/DiscountsContext', () => ({ DiscountsProvider: provider('discounts') }))
vi.mock('@/context/OrdersContext', () => ({ OrdersProvider: provider('orders') }))
vi.mock('@/context/ProductsContext', () => ({ ProductsProvider: provider('products') }))
vi.mock('@/context/SettingsContext', () => ({ SettingsProvider: provider('settings') }))

import DashboardRouteProviders from './DashboardRouteProviders'

function renderRoute(props: Record<string, boolean> = {}) {
  initialized.length = 0
  renderToStaticMarkup(
    <DashboardRouteProviders {...props}>
      <main>route content</main>
    </DashboardRouteProviders>
  )
  return [...initialized].sort()
}

describe('dashboard route provider runtime fan-out', () => {
  afterEach(() => {
    initialized.length = 0
  })

  it('initializes only products and settings for the Products route', () => {
    expect(renderRoute({ products: true })).toEqual(['products', 'settings'])
  })

  it('initializes only orders and settings for the Orders route', () => {
    expect(renderRoute({ orders: true })).toEqual(['orders', 'settings'])
  })

  it('initializes only customers and settings for the Customers route', () => {
    expect(renderRoute({ customers: true })).toEqual(['customers', 'settings'])
  })

  it('initializes only discounts and settings for Promotions', () => {
    expect(renderRoute({ discounts: true })).toEqual(['discounts', 'settings'])
  })

  it('initializes settings alone for Settings and Media routes', () => {
    expect(renderRoute()).toEqual(['settings'])
  })

  it('initializes the explicit analytics fan-out and nothing else', () => {
    expect(renderRoute({ customers: true, discounts: true, orders: true, products: true })).toEqual([
      'customers',
      'discounts',
      'orders',
      'products',
      'settings',
    ])
  })
})

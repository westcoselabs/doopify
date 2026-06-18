export type AdminCommandItem = {
  action?: 'open-promotion-create'
  href?: string
  keywords?: string[]
  label: string
  shortcut?: string
}

export type AdminCommandGroup = {
  heading: string
  items: AdminCommandItem[]
}

export function getAdminCommandGroups(): AdminCommandGroup[] {
  return [
    {
      heading: 'Navigation',
      items: [
        { label: 'Dashboard', href: '/admin', keywords: ['home', 'overview', 'analytics'] },
        { label: 'Products', href: '/products', keywords: ['inventory', 'catalog', 'merch', 'items'] },
        { label: 'Collections', href: '/admin/collections', keywords: ['categories', 'groups', 'merchandising'] },
        {
          label: 'Promotions',
          href: '/discounts',
          keywords: ['discounts', 'automatic promotions', 'sales'],
        },
        { label: 'Orders', href: '/orders', keywords: ['sales', 'customers', 'checkout'] },
        { label: 'Settings', href: '/settings', keywords: ['store', 'branding', 'configuration'] },
        {
          label: 'Open Delivery logs',
          href: '/admin/webhooks',
          keywords: ['events', 'observability', 'logs', 'webhooks'],
        },
      ],
    },
    {
      heading: 'Create',
      items: [
        { label: 'Create product', href: '/products', keywords: ['new product', 'add product', 'inventory'] },
        {
          label: 'Create collection',
          href: '/admin/collections',
          keywords: ['new collection', 'add collection'],
        },
        {
          label: 'Create promotion',
          action: 'open-promotion-create',
          href: '/discounts',
          keywords: ['new discount', 'automatic promotion', 'sale'],
        },
      ],
    },
  ]
}

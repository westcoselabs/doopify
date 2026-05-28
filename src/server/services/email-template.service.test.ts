import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStoreSettingsLite: vi.fn(),
  getEmailTemplateSetting: vi.fn(),
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

vi.mock('@/server/services/email-template-settings.service', () => ({
  getEmailTemplateSetting: mocks.getEmailTemplateSetting,
  renderTemplateVariables: (text: string, vars: Record<string, string>) =>
    text.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? ''),
  isTemplateEnabled: (fields: { enabled: boolean }) => fields.enabled,
}))

import { buildOrderConfirmationEmailMessage } from './email-template.service'

const defaultFields = {
  enabled: true,
  subject: 'Your order {{orderNumber}} is confirmed',
  preheader: 'Thank you.',
  headerTitle: 'Order confirmation',
  bodyText: 'Thanks for your order!',
  buttonLabel: 'View order',
  footerText: 'Thanks for choosing us.',
  replyToEmail: null,
}

describe('email template service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStoreSettingsLite.mockResolvedValue({
      name: 'Doopify & Co',
      email: 'orders@example.com',
    })
    mocks.getEmailTemplateSetting.mockResolvedValue({
      templateKey: 'order_confirmation',
      isCustomized: false,
      fields: defaultFields,
    })
  })

  it('escapes dynamic html fields in order confirmation template output', async () => {
    const message = await buildOrderConfirmationEmailMessage({
      orderNumber: 1001,
      orderId: 'order-1',
      email: 'customer@example.com',
      currency: 'USD',
      total: 59.99,
      items: [
        {
          title: '<script>alert(1)</script>',
          variantTitle: `L & "Blue"`,
          quantity: 1,
          price: 59.99,
        },
      ],
      shippingAddress: {
        firstName: 'Ada <img>',
        lastName: `O'Neil`,
        address1: '1 <Compute> Way',
        city: 'London',
        province: 'N/A',
        postalCode: 'N1 1AA',
        country: 'GB',
      },
    })

    expect(message).not.toBeNull()
    expect(message!.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; - L &amp; &quot;Blue&quot;')
    expect(message!.html).toContain('Ada &lt;img&gt; O&#39;Neil')
    expect(message!.html).toContain('1 &lt;Compute&gt; Way')
    expect(message!.html).toContain('Doopify &amp; Co')
    expect(message!.html).not.toContain('<script>alert(1)</script>')
  })

  it('returns null when the template is disabled', async () => {
    mocks.getEmailTemplateSetting.mockResolvedValue({
      templateKey: 'order_confirmation',
      isCustomized: true,
      fields: { ...defaultFields, enabled: false },
    })

    const message = await buildOrderConfirmationEmailMessage({
      orderNumber: 1001,
      email: 'customer@example.com',
      currency: 'USD',
      total: 10,
      items: [{ title: 'Item', quantity: 1, price: 10 }],
    })

    expect(message).toBeNull()
  })

  it('renders digital download links with safe copy and no token hash exposure', async () => {
    const message = await buildOrderConfirmationEmailMessage({
      orderNumber: 1004,
      orderId: 'order-4',
      email: 'customer@example.com',
      currency: 'USD',
      total: 29,
      items: [{ title: 'Digital Kit', quantity: 1, price: 29 }],
      digitalDownloads: [
        {
          title: 'Digital Kit',
          fileName: 'Digital-Kit.zip',
          downloadUrl: 'https://store.example.com/api/digital-downloads/raw-token-value',
          expiresAt: '2026-06-27T00:00:00.000Z',
          downloadLimit: 5,
          downloadCount: 0,
        },
      ],
      digitalDownloadsPending: false,
    })

    expect(message).not.toBeNull()
    expect(message!.html).toContain('Your downloads are ready.')
    expect(message!.html).toContain('This secure link expires on')
    expect(message!.html).toContain('can be used up to 5 times')
    expect(message!.html).toContain('https://store.example.com/api/digital-downloads/raw-token-value')
    expect(message!.html).not.toContain('tokenHash')
    expect(message!.html).not.toContain('storageKey')
  })
})

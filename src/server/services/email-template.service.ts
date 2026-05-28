import {
  getEmailTemplateSetting,
  renderTemplateVariables,
  isTemplateEnabled,
  type EmailTemplateSettingFields,
} from '@/server/services/email-template-settings.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

export type OrderConfirmationInput = {
  orderId?: string
  orderNumber: number
  email: string
  currency: string
  total: number
  items: Array<{
    title: string
    variantTitle?: string | null
    quantity: number
    price: number
  }>
  shippingAddress?: {
    firstName?: string | null
    lastName?: string | null
    address1?: string | null
    city?: string | null
    province?: string | null
    postalCode?: string | null
    country?: string | null
  } | null
  digitalDownloads?: Array<{
    title: string
    fileName: string
    downloadUrl: string
    expiresAt: Date | string
    downloadLimit: number
    downloadCount: number
  }>
  digitalDownloadsPending?: boolean
}

export type AbandonedCheckoutRecoveryInput = {
  checkoutSessionId: string
  email: string
  currency: string
  totalCents: number
  recoveryUrl: string
  items: Array<{
    title: string
    variantTitle?: string
    quantity: number
  }>
}

export type FulfillmentTrackingEmailInput = {
  orderNumber: number
  email: string
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrier?: string | null
  service?: string | null
  items: Array<{
    title: string
    variantTitle?: string | null
    quantity: number
  }>
}

type EmailBranding = {
  logoUrl: string | null
  headerColor: string
  footerText: string
  supportEmail: string | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}

function formatEmailDate(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function resolveEmailBranding(
  store: Awaited<ReturnType<typeof getStoreSettingsLite>>
): EmailBranding {
  return {
    logoUrl: store?.emailLogoUrl || store?.logoUrl || null,
    headerColor: store?.emailHeaderColor || store?.primaryColor || '#111827',
    footerText: store?.emailFooterText || 'Thanks for choosing us.',
    supportEmail: store?.supportEmail || store?.email || null,
  }
}

function renderEmailHeader(storeName: string, branding: EmailBranding) {
  return `
    <div style="padding:18px 22px;background:${escapeHtml(branding.headerColor)};border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      ${
        branding.logoUrl
          ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(storeName)}" style="display:block;max-height:38px;width:auto;" />`
          : `<strong style="font-size:14px;color:#ffffff;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(storeName)}</strong>`
      }
      ${
        branding.supportEmail
          ? `<span style="font-size:12px;color:rgba(255,255,255,0.92);">${escapeHtml(branding.supportEmail)}</span>`
          : ''
      }
    </div>
  `
}

function renderEmailFooter(branding: EmailBranding) {
  return `
    <div style="padding:14px 22px;border-top:1px solid #e5e7eb;background:#f9fafb;border-radius:0 0 14px 14px;">
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">${escapeHtml(branding.footerText)}</p>
    </div>
  `
}

function formatAddress(address: OrderConfirmationInput['shippingAddress']) {
  if (!address) return 'No shipping address provided.'

  return [
    [address.firstName, address.lastName].filter(Boolean).join(' ').trim(),
    address.address1,
    [address.city, address.province, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ]
    .filter(Boolean)
    .map((segment) => escapeHtml(segment))
    .join('<br />')
}

function renderDigitalDownloadsSection(input: OrderConfirmationInput) {
  const downloads = input.digitalDownloads ?? []
  if (downloads.length === 0) {
    if (!input.digitalDownloadsPending) {
      return ''
    }

    return `
      <div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;margin-bottom:24px;">
        <p style="margin:0;font-size:16px;color:#111827;"><strong>Your files are being prepared. Check your email shortly.</strong></p>
      </div>
    `
  }

  const rows = downloads
    .map((entry) => {
      const expiresAt = formatEmailDate(entry.expiresAt)
      const detail = expiresAt
        ? `This secure link expires on ${expiresAt} and can be used up to ${entry.downloadLimit} times.`
        : `This secure link can be used up to ${entry.downloadLimit} times.`

      return `
        <div style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;margin:0 0 12px;">
          <p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>${escapeHtml(entry.title || entry.fileName)}</strong></p>
          <p style="margin:0 0 10px;font-size:12px;color:#4b5563;">${escapeHtml(detail)}</p>
          <a href="${escapeHtml(entry.downloadUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Download</a>
        </div>
      `
    })
    .join('')

  return `
    <div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:18px;color:#111827;"><strong>Your downloads are ready.</strong></p>
      ${rows}
      <p style="margin:0;font-size:12px;color:#6b7280;">If you have trouble with a link, reply to this email for support.</p>
    </div>
  `
}

function buildOrderConfirmationHtml(
  input: OrderConfirmationInput,
  storeName: string,
  branding: EmailBranding
) {
  const itemRows = input.items
    .map((item) => {
      const itemTitle = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title
      return `<tr>
        <td style="padding:8px 0;color:#111827;">${escapeHtml(itemTitle)}</td>
        <td style="padding:8px 0;color:#6b7280;text-align:center;">${escapeHtml(item.quantity)}</td>
        <td style="padding:8px 0;color:#111827;text-align:right;">${formatMoney(item.price * item.quantity, input.currency)}</td>
      </tr>`
    })
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${renderEmailHeader(storeName, branding)}
      <div style="padding:28px 22px;background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${escapeHtml(storeName)}</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;">Order confirmation</h1>
        <p style="font-size:16px;color:#4b5563;margin:0 0 24px;">Thanks for your purchase. Your order <strong>#${escapeHtml(input.orderNumber)}</strong> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">Item</th>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">Qty</th>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-size:12px;color:#6b7280;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="font-size:18px;margin:0 0 24px;"><strong>Total:</strong> ${formatMoney(input.total, input.currency)}</p>
        ${renderDigitalDownloadsSection(input)}
        <div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Shipping address</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${formatAddress(input.shippingAddress)}</p>
        </div>
      </div>
      ${renderEmailFooter(branding)}
    </div>
  `
}

function buildAbandonedCheckoutRecoveryHtml(
  input: AbandonedCheckoutRecoveryInput,
  storeName: string,
  branding: EmailBranding
) {
  const itemRows = input.items
    .map((item) => {
      const itemLabel = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title
      return `<li style="margin:0 0 8px;color:#111827;">${escapeHtml(itemLabel)} x ${escapeHtml(
        item.quantity
      )}</li>`
    })
    .join('')

  const recoveredTotal = formatMoney(input.totalCents / 100, input.currency)
  const itemsSection = itemRows
    ? `<ul style="padding-left:18px;margin:0 0 18px;">${itemRows}</ul>`
    : '<p style="margin:0 0 18px;color:#4b5563;">Your cart items are ready to restore.</p>'

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${renderEmailHeader(storeName, branding)}
      <div style="padding:28px 22px;background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${escapeHtml(storeName)}</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;">You left something behind</h1>
        <p style="font-size:16px;color:#4b5563;margin:0 0 16px;">Your checkout is still available. Pick up where you left off.</p>
        ${itemsSection}
        <p style="font-size:18px;margin:0 0 24px;"><strong>Estimated total:</strong> ${escapeHtml(recoveredTotal)}</p>
        <a href="${escapeHtml(input.recoveryUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">Resume checkout</a>
        <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">If you already completed this purchase, you can ignore this message.</p>
      </div>
      ${renderEmailFooter(branding)}
    </div>
  `
}

function buildFulfillmentTrackingHtml(
  input: FulfillmentTrackingEmailInput,
  storeName: string,
  branding: EmailBranding
) {
  const itemRows = input.items
    .map((item) => {
      const itemLabel = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title
      return `<li style="margin:0 0 8px;color:#111827;">${escapeHtml(itemLabel)} x ${escapeHtml(
        item.quantity
      )}</li>`
    })
    .join('')

  const carrierLine = [input.carrier, input.service].filter(Boolean).join(' ')
  const trackingText = input.trackingNumber ? `Tracking #${input.trackingNumber}` : 'Tracking details pending'
  const trackingHref = input.trackingUrl?.trim()

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${renderEmailHeader(storeName, branding)}
      <div style="padding:28px 22px;background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${escapeHtml(storeName)}</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;">Your order is on the way</h1>
        <p style="font-size:16px;color:#4b5563;margin:0 0 16px;">Order <strong>#${escapeHtml(input.orderNumber)}</strong> has shipped.</p>
        ${
          carrierLine
            ? `<p style="margin:0 0 12px;font-size:14px;color:#111827;"><strong>Carrier:</strong> ${escapeHtml(carrierLine)}</p>`
            : ''
        }
        <p style="margin:0 0 20px;font-size:14px;color:#111827;"><strong>${escapeHtml(trackingText)}</strong></p>
        ${
          trackingHref
            ? `<a href="${escapeHtml(trackingHref)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:22px;">Track shipment</a>`
            : ''
        }
        ${
          itemRows
            ? `<div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Items in this shipment</p>
                <ul style="padding-left:18px;margin:0;">${itemRows}</ul>
              </div>`
            : ''
        }
      </div>
      ${renderEmailFooter(branding)}
    </div>
  `
}

// ── Customized HTML builders using saved template settings ────────────────────

function buildCustomizedOrderConfirmationHtml(
  input: OrderConfirmationInput,
  fields: EmailTemplateSettingFields,
  storeName: string,
  branding: EmailBranding
) {
  const vars = {
    orderNumber: String(input.orderNumber),
    storeName,
    customerName: '',
  }
  const headerTitle = renderTemplateVariables(fields.headerTitle, vars)
  const bodyText = renderTemplateVariables(fields.bodyText, vars)
  const buttonLabel = renderTemplateVariables(fields.buttonLabel, vars)
  const footerForEmail: EmailBranding = { ...branding, footerText: renderTemplateVariables(fields.footerText, vars) }

  const itemRows = input.items
    .map((item) => {
      const itemTitle = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title
      return `<tr>
        <td style="padding:8px 0;color:#111827;">${escapeHtml(itemTitle)}</td>
        <td style="padding:8px 0;color:#6b7280;text-align:center;">${escapeHtml(item.quantity)}</td>
        <td style="padding:8px 0;color:#111827;text-align:right;">${formatMoney(item.price * item.quantity, input.currency)}</td>
      </tr>`
    })
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${renderEmailHeader(storeName, branding)}
      <div style="padding:28px 22px;background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${escapeHtml(storeName)}</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;">${escapeHtml(headerTitle)}</h1>
        <p style="font-size:16px;color:#4b5563;margin:0 0 24px;">${escapeHtml(bodyText)}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#111827;"><strong>Order #${escapeHtml(input.orderNumber)}</strong></p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">Item</th>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">Qty</th>
              <th style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-size:12px;color:#6b7280;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="font-size:18px;margin:0 0 24px;"><strong>Total:</strong> ${formatMoney(input.total, input.currency)}</p>
        ${renderDigitalDownloadsSection(input)}
        ${input.shippingAddress ? `
        <div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Shipping address</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${formatAddress(input.shippingAddress)}</p>
        </div>` : ''}
        <div style="margin-top:24px;">
          <a href="#" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(buttonLabel)}</a>
        </div>
      </div>
      ${renderEmailFooter(footerForEmail)}
    </div>
  `
}

function buildCustomizedFulfillmentTrackingHtml(
  input: FulfillmentTrackingEmailInput,
  fields: EmailTemplateSettingFields,
  storeName: string,
  branding: EmailBranding
) {
  const vars = {
    orderNumber: String(input.orderNumber),
    storeName,
    customerName: '',
    trackingNumber: input.trackingNumber || '',
    trackingUrl: input.trackingUrl || '',
  }
  const headerTitle = renderTemplateVariables(fields.headerTitle, vars)
  const bodyText = renderTemplateVariables(fields.bodyText, vars)
  const buttonLabel = renderTemplateVariables(fields.buttonLabel, vars)
  const footerForEmail: EmailBranding = { ...branding, footerText: renderTemplateVariables(fields.footerText, vars) }

  const itemRows = input.items
    .map((item) => {
      const itemLabel = item.variantTitle ? `${item.title} - ${item.variantTitle}` : item.title
      return `<li style="margin:0 0 8px;color:#111827;">${escapeHtml(itemLabel)} x ${escapeHtml(item.quantity)}</li>`
    })
    .join('')

  const trackingText = input.trackingNumber ? `Tracking #${input.trackingNumber}` : 'Tracking details pending'
  const trackingHref = input.trackingUrl?.trim()
  const carrierLine = [input.carrier, input.service].filter(Boolean).join(' ')

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${renderEmailHeader(storeName, branding)}
      <div style="padding:28px 22px;background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${escapeHtml(storeName)}</p>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;">${escapeHtml(headerTitle)}</h1>
        <p style="font-size:16px;color:#4b5563;margin:0 0 16px;">${escapeHtml(bodyText)}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#111827;"><strong>Order #${escapeHtml(input.orderNumber)}</strong></p>
        ${carrierLine ? `<p style="margin:0 0 12px;font-size:14px;color:#111827;"><strong>Carrier:</strong> ${escapeHtml(carrierLine)}</p>` : ''}
        <p style="margin:0 0 20px;font-size:14px;color:#111827;"><strong>${escapeHtml(trackingText)}</strong></p>
        ${trackingHref
          ? `<a href="${escapeHtml(trackingHref)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:22px;">${escapeHtml(buttonLabel)}</a>`
          : `<span style="display:inline-block;padding:14px 22px;border-radius:999px;background:#9ca3af;color:#ffffff;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:22px;">${escapeHtml(buttonLabel)}</span>`}
        ${itemRows ? `<div style="padding:20px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Items in this shipment</p>
          <ul style="padding-left:18px;margin:0;">${itemRows}</ul>
        </div>` : ''}
      </div>
      ${renderEmailFooter(footerForEmail)}
    </div>
  `
}

// ── Test HTML builders (sample data, no real orders) ─────────────────────────

export function buildOrderConfirmationTestHtml(
  fields: EmailTemplateSettingFields,
  storeName: string,
  store: Awaited<ReturnType<typeof getStoreSettingsLite>>
): string {
  const branding = resolveEmailBranding(store)
  const sampleInput: OrderConfirmationInput = {
    orderNumber: 1001,
    email: 'test@example.com',
    currency: 'USD',
    total: 79.99,
    items: [
      { title: 'Sample Product', variantTitle: 'Large / Blue', quantity: 2, price: 34.99 },
      { title: 'Another Item', variantTitle: null, quantity: 1, price: 9.99 },
    ],
    shippingAddress: {
      firstName: 'Test', lastName: 'Customer',
      address1: '123 Main St', city: 'Portland',
      province: 'OR', postalCode: '97201', country: 'US',
    },
  }
  return buildCustomizedOrderConfirmationHtml(sampleInput, fields, storeName, branding)
}

export function buildFulfillmentTrackingTestHtml(
  fields: EmailTemplateSettingFields,
  storeName: string,
  store: Awaited<ReturnType<typeof getStoreSettingsLite>>
): string {
  const branding = resolveEmailBranding(store)
  const sampleInput: FulfillmentTrackingEmailInput = {
    orderNumber: 1001,
    email: 'test@example.com',
    trackingNumber: '1Z999AA10123456784',
    trackingUrl: 'https://example.com/track/1Z999AA10123456784',
    carrier: 'UPS',
    service: 'Ground',
    items: [{ title: 'Sample Product', variantTitle: 'Large / Blue', quantity: 2 }],
  }
  return buildCustomizedFulfillmentTrackingHtml(sampleInput, fields, storeName, branding)
}

export async function buildOrderConfirmationEmailMessage(input: OrderConfirmationInput) {
  const store = await getStoreSettingsLite()
  const storeName = store?.name || 'Doopify'
  const from = store?.email || 'orders@doopify.local'
  const branding = resolveEmailBranding(store)

  const setting = await getEmailTemplateSetting('order_confirmation')
  const fields = setting.fields

  if (!isTemplateEnabled(fields)) {
    return null
  }

  const vars = { orderNumber: String(input.orderNumber), storeName, customerName: '' }
  const subject = renderTemplateVariables(fields.subject, vars)
  const html = buildCustomizedOrderConfirmationHtml(input, fields, storeName, branding)

  return { from, subject, html }
}

export async function buildAbandonedCheckoutRecoveryEmailMessage(input: AbandonedCheckoutRecoveryInput) {
  const store = await getStoreSettingsLite()
  const storeName = store?.name || 'Doopify'
  const from = store?.email || 'orders@doopify.local'
  const branding = resolveEmailBranding(store)
  const subject = `${storeName}: you left something behind`
  const html = buildAbandonedCheckoutRecoveryHtml(input, storeName, branding)

  return {
    from,
    subject,
    html,
  }
}

export async function buildFulfillmentTrackingEmailMessage(input: FulfillmentTrackingEmailInput) {
  const store = await getStoreSettingsLite()
  const storeName = store?.name || 'Doopify'
  const from = store?.email || 'orders@doopify.local'
  const branding = resolveEmailBranding(store)

  const setting = await getEmailTemplateSetting('fulfillment_tracking')
  const fields = setting.fields

  if (!isTemplateEnabled(fields)) {
    return null
  }

  const vars = {
    orderNumber: String(input.orderNumber),
    storeName,
    customerName: '',
    trackingNumber: input.trackingNumber || '',
    trackingUrl: input.trackingUrl || '',
  }
  const subject = renderTemplateVariables(fields.subject, vars)
  const html = buildCustomizedFulfillmentTrackingHtml(input, fields, storeName, branding)

  return { from, subject, html }
}

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { WEBHOOK_EVENT_GROUPS, webhookEventsFromGroups, webhookGroupsFromEvents } from './webhooks-settings.helpers'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('settings compact flow', () => {
  it('uses General as the default settings tab and does not default to Brand kit', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain("{ id: 'general', label: 'General' }")
    expect(workspace).toContain("const [activeSection, setActiveSection] = useState('general')")
  })

  it('uses Shipping & delivery tab and splits taxes into a separate tab', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain("{ id: 'shipping', label: 'Shipping & delivery' }")
    expect(workspace).toContain("{ id: 'taxes', label: 'Taxes & duties' }")
    expect(workspace).not.toContain("{ id: 'shipping', label: 'Shipping & tax' }")
    expect(workspace).toContain("activeSection === 'shipping' ? (")
    expect(workspace).toContain('onModeSaveStateChange={handleShippingModeSaveStateChange}')
    expect(workspace).toContain('onRegisterSaveAction={handleRegisterShippingModeSaveAction}')
    expect(workspace).toContain("activeSection === 'taxes'")
  })

  it('keeps Taxes & duties tax-only and excludes shipping setup UI', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')
    const taxesStart = workspace.indexOf("activeSection === 'taxes' ? (")
    const paymentsStart = workspace.indexOf("activeSection === 'payments' ? (")
    const taxesBlock =
      taxesStart >= 0 && paymentsStart > taxesStart ? workspace.slice(taxesStart, paymentsStart) : ''

    expect(taxesBlock).toContain('Tax collection')
    expect(taxesBlock).toContain('Tax regions')
    expect(taxesBlock).toContain('International duties & import taxes')
    expect(taxesBlock).toContain('International customs support is coming later.')
    expect(taxesBlock).toContain('Tax preview')
    expect(taxesBlock).toContain('Calculate preview')

    expect(taxesBlock).not.toContain('Shipping provider setup')
    expect(taxesBlock).not.toContain('Shippo')
    expect(taxesBlock).not.toContain('EasyPost')
    expect(taxesBlock).not.toContain('Manual rates')
    expect(taxesBlock).not.toContain('Live rates mode')
    expect(taxesBlock).not.toContain('Shipping zones')
    expect(taxesBlock).not.toContain('Shipping rate')
    expect(taxesBlock).not.toContain('HS codes')
    expect(taxesBlock).not.toContain('Country of origin')
    expect(taxesBlock).not.toContain('Origin postal code')
  })

  it('renames Storefront / brand to Brand & appearance and explains scope clearly', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain("{ id: 'brand-kit', label: 'Brand & appearance' }")
    expect(workspace).toContain('Theme customization is locked for private beta. Logos and support details are used across storefront, checkout, customer emails, and documents.')
    expect(workspace).toContain('Email wording is edited in Settings -&gt; Email.')
  })

  it('keeps Brand and Email cross-navigation explicit for template wording edits', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('Want to change email wording? Manage customer email templates in Settings -&gt; Email.')
    expect(workspace).toContain('<Link href="/admin/settings?section=email">Open email templates</Link>')
  })

  it('polishes General address card without a fake coming-soon editor', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')
    const generalPanel = read('src/components/settings/GeneralSettingsPanel.js')

    expect(workspace).toContain('<GeneralSettingsPanel')
    expect(generalPanel).toContain('<h4>Store address</h4>')
    expect(generalPanel).toContain('No store address configured')
    expect(generalPanel).not.toContain('Address editor')
    expect(generalPanel).not.toContain('Address editing will be expanded here.')
  })

  it('renders General currency and time zone as AdminSelect controls with helper copy', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')
    const generalPanel = read('src/components/settings/GeneralSettingsPanel.js')

    expect(workspace).toContain('timezoneOptions={GENERAL_SETTINGS_TIMEZONE_OPTIONS}')
    expect(workspace).toContain('currencyOptions={GENERAL_SETTINGS_CURRENCY_OPTIONS}')
    expect(generalPanel).toContain("label=\"Time zone\"")
    expect(generalPanel).toContain("label=\"Currency\"")
    expect(generalPanel).toContain('options={timezoneOptions}')
    expect(generalPanel).toContain('options={currencyOptions}')
    expect(generalPanel).toContain('Used for admin date displays, scheduled actions, and merchant-facing timestamps.')
    expect(generalPanel).toContain('Used for new checkout sessions, payment intents, shipping rates, and new orders. Existing orders keep their original currency.')
    expect(generalPanel).not.toContain('<AdminInput onChange={(event) => onSettingsPatch({ timezone: event.target.value })}')
    expect(generalPanel).not.toContain('<AdminInput onChange={(event) => onSettingsPatch({ currency: event.target.value })}')
  })

  it('keeps Payments rows compact with drawer-based management', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('compactProviderRow')
    expect(workspace).toContain('onClick={() => openPaymentDrawer(providerRow.id)}')
    expect(workspace).toContain('open={Boolean(activePaymentDrawer)}')
  })

  it('renders compact Stripe drawer status labels and keeps secret metadata masked', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('Connect Stripe and manage checkout credentials.')
    expect(workspace).toContain('Stripe is not configured')
    expect(workspace).toContain('Stripe credentials saved')
    expect(workspace).toContain('Stripe is connected')
    expect(workspace).toContain('Stripe connection (view only)')
    expect(workspace).toContain('Owner required')
    expect(workspace).toContain('View only')
    expect(workspace).toContain('Only owners can save, replace, or verify Stripe credentials. You can view the current connection status, but credential actions are restricted.')
    expect(workspace).toContain('Owner permission required')
    expect(workspace).toContain('Credentials are saved. Use "Verify now" to confirm live API connectivity.')
    expect(workspace).toContain('Verified connection. Source:')
    expect(workspace).toContain('Save Stripe settings')
    expect(workspace).toContain('Verify now')
    expect(workspace).toContain("label: 'Status'")
    expect(workspace).toContain("label: 'Mode'")
    expect(workspace).toContain("label: 'Credentials source'")
    expect(workspace).toContain("label: 'API keys'")
    expect(workspace).toContain("label: 'Webhook'")
    expect(workspace).toContain("label: 'Last verified'")
    expect(workspace).toContain('{stripeCredentialMaskMap.PUBLISHABLE_KEY}')
    expect(workspace).toContain('{stripeCredentialMaskMap.SECRET_KEY}')
    expect(workspace).toContain('{stripeCredentialMaskMap.WEBHOOK_SECRET}')
    expect(workspace).toContain('Replace')
    expect(workspace).toContain('Cancel replacement')
    expect(workspace).not.toContain('Saved: {stripeCredentialMaskMap.PUBLISHABLE_KEY}')
    expect(workspace).not.toContain('Saved: {stripeCredentialMaskMap.SECRET_KEY}')
    expect(workspace).not.toContain('Saved: {stripeCredentialMaskMap.WEBHOOK_SECRET}')
    expect(workspace).toContain('buildStripeMaskedCredentialMap')
    expect(workspace).toContain('shouldShowStripeCredentialInput')
    expect(workspace).toContain('resolveStripeConnectionState')
    expect(workspace).toContain('runtimeStatus: stripeDisplayedRuntimeStatus || null')
    expect(workspace).toContain('const stripeCredentialMeta = providerStatusMap.STRIPE?.credentialMeta || [];')
    expect(workspace).toContain('const stripeSavedCredentialEntries = useMemo(() => {')
    expect(workspace).toContain('void refreshProviderStatuses({ includeRuntime: false });')
    expect(workspace).toContain('Credentials are saved securely. Secret values are encrypted and hidden. Use Replace only when changing keys.')
    expect(workspace).toContain('<details className={styles.drawerDetails}>')
    expect(workspace).toContain('<summary className={styles.drawerDetailsSummary}>Developer details</summary>')
    expect(workspace).toContain('<span className={styles.statusSummaryLabel}>Endpoint URL</span>')
    expect(workspace).toContain('Copy webhook endpoint')
    expect(workspace).toContain('Store URL needs setup')
    expect(workspace).toContain('Show advanced options')
    expect(workspace).toContain('Hide advanced options')
    expect(workspace).toContain('buildStripeCredentialSavePayload({')
    expect(workspace).toContain('savedMaskMap: stripeCredentialMaskMap')

    const stripeRefreshCallCount = (workspace.match(/await refreshProviderStatuses\(\);/g) || []).length
    expect(stripeRefreshCallCount).toBeGreaterThanOrEqual(3)
  })

  it('uses the new tax collection drawer copy and save feedback labels', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('Configure how Doopify calculates tax at checkout.')
    expect(workspace).toContain('Adds tax during checkout using your manual tax rules.')
    expect(workspace).toContain('Manual uses the rates you configure in Doopify. Automated tax is coming later.')
    expect(workspace).toContain('Default rate used when no region-specific rule matches.')
    expect(workspace).toContain('Applies tax to shipping charges when enabled.')
    expect(workspace).toContain('Use only if product prices already include tax.')
    expect(workspace).toContain("'Saving...'")
    expect(workspace).toContain("'Saved'")
    expect(workspace).toContain("'Failed'")
    expect(workspace).toContain('pushSettingsToast(\'Tax settings saved\', \'success\')')
  })

  it('keeps PayPal and SendLayer drawers honest without fake editable credential forms', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).not.toContain('PayPal client id (future)')
    expect(workspace).not.toContain('sendlayer api key (future)')
    expect(workspace).toContain('<strong>Checkout visibility:</strong> Hidden')
    expect(workspace).toContain('<strong>Runtime:</strong> Not implemented')
  })

  it('keeps the manual payments drawer compact with instructions and safety warning', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('Cash instructions')
    expect(workspace).toContain('Bank transfer instructions')
    expect(workspace).toContain('Save instructions')
    expect(workspace).toContain('Manual storefront checkout is disabled until server-owned manual payment finalization is implemented.')
  })

  it('renders Webhooks as a compact endpoint manager instead of the old giant add form', () => {
    const integrationsPanel = read('src/components/settings/IntegrationsPanel.js')

    expect(integrationsPanel).toContain('Connected endpoints')
    expect(integrationsPanel).toContain('Needs attention')
    expect(integrationsPanel).toContain('Create endpoint')
    expect(integrationsPanel).toContain('open={Boolean(drawerMode)}')
    expect(integrationsPanel).not.toContain('Add integration')
    expect(integrationsPanel).not.toContain('Subscribed events')
  })

  it('applies compact drawer cards to shipping provider manage flow', () => {
    const shippingWorkspace = read('src/components/settings/ShippingSettingsWorkspace.js')

    expect(shippingWorkspace).toContain('title="Manage provider"')
    expect(shippingWorkspace).toContain('className={styles.compactDrawerCard}')
    expect(shippingWorkspace).toContain('<h4>Advanced</h4>')
  })

  it('includes ship-from email field and helper copy in location drawer', () => {
    const shippingWorkspace = read('src/components/settings/ShippingSettingsWorkspace.js')

    expect(shippingWorkspace).toContain('label="Email"')
    expect(shippingWorkspace).toContain('Used by carriers when buying labels. Required for Shippo/USPS labels.')
    expect(shippingWorkspace).toContain('const normalizedEmail = normalizeOptional(locationForm.email);')
    expect(shippingWorkspace).toContain('email: normalizedEmail,')
    expect(shippingWorkspace).toContain('Ship-from email is required for Shippo/USPS labels.')
  })

  it('keeps brand save behavior with API-backed patching', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain("fetch('/api/settings/brand-kit'")
    expect(workspace).toContain('async function handleBrandKitSave()')
    expect(workspace).toContain("activeSection === 'brand-kit'")
    expect(workspace).toContain("activeSection === 'shipping'")
    expect(workspace).toContain('showHeaderSaveButton')
    expect(workspace).toContain('headerSaveButtonLabel')
  })

  it('hides incomplete storefront theme controls in private beta brand settings', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).not.toContain('<span>Primary color</span>')
    expect(workspace).not.toContain('<span>Secondary color</span>')
    expect(workspace).not.toContain('<span>Accent color</span>')
    expect(workspace).not.toContain('<span>Text color</span>')
    expect(workspace).not.toContain('<span>Heading font</span>')
    expect(workspace).not.toContain('<span>Body font</span>')
    expect(workspace).not.toContain('<span>Button radius</span>')
    expect(workspace).not.toContain('<span>Button style</span>')
    expect(workspace).not.toContain('<span>Button text transform</span>')
  })

  it('supports visible shipping save states in the top-right header', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('shippingModeSavedState')
    expect(workspace).toContain('shippingModeDirty')
    expect(workspace).toContain('shippingModeSaveActionReady')
    expect(workspace).toContain('shippingModeSaveError')
    expect(workspace).toContain('shippingModeSaveActionRef')
    expect(workspace).toContain('getShippingHeaderSaveButtonState')
    expect(workspace).toContain('resolveShippingSaveActionRegistration')
    expect(workspace).toContain('invokeShippingSaveAction')
    expect(workspace).toContain("setShippingModeSavedState((current) => (current === 'saved_just_now' ? 'saved' : current))")
    expect(workspace).toContain("? () => void invokeShippingSaveAction(shippingModeSaveActionRef.current)")
  })

  it('clarifies Brand & appearance preview labels and usage copy', () => {
    const workspace = read('src/components/settings/SettingsWorkspace.js')

    expect(workspace).toContain('<h4>Storefront preview</h4>')
    expect(workspace).toContain('<h4>Checkout preview</h4>')
    expect(workspace).toContain('<h4>Email preview</h4>')
    expect(workspace).not.toContain('Controls storefront page colors, fonts, and buttons.')
    expect(workspace).toContain('Controls checkout identity assets used in customer-facing surfaces.')
    expect(workspace).toContain('Controls customer email logo/header/footer styling.')
    expect(workspace).toContain('Used for storefront logo, favicon, packing slips, and default email branding.')
    expect(workspace).not.toContain('Storefront theme')
    expect(workspace).not.toContain('Primary color')
    expect(workspace).not.toContain('Button style')
  })

  it('maps friendly webhook groups only to real typed events', () => {
    const allowedEvents = new Set([
      'order.paid',
      'order.refunded',
      'refund.issued',
      'fulfillment.created',
    ])

    for (const group of WEBHOOK_EVENT_GROUPS) {
      for (const eventName of group.events) {
        expect(allowedEvents.has(eventName)).toBe(true)
      }
    }

    expect(webhookEventsFromGroups(['paid_orders', 'refunds', 'fulfillments'])).toEqual(
      expect.arrayContaining(['order.paid', 'order.refunded', 'refund.issued', 'fulfillment.created'])
    )
    expect(webhookGroupsFromEvents(['order.paid', 'fulfillment.created'])).toEqual(
      expect.arrayContaining(['paid_orders', 'fulfillments'])
    )
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('settings skeleton integration', () => {
  it('uses shared settings skeleton primitives in workspace', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    const loadStateSource = read('src/components/settings/SettingsWorkspaceLoadState.js')

    expect(source).toContain("import SettingsWorkspaceLoadState")
    expect(source).toContain('SettingsProviderRowsSkeleton')
    expect(source).toContain('isSettingsTabLoadingState')
    expect(source).toContain('activeTabLoading')
    expect(source).toContain('<SettingsWorkspaceLoadState')

    expect(loadStateSource).toContain("import SettingsPageSkeleton from './SettingsSkeletons'")
    expect(loadStateSource).toContain('<SettingsPageSkeleton section={activeSection} />')
  })

  it('keeps header save action disabled while active tab skeleton is visible', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    expect(source).toContain('activeTabLoading ||')
  })

  it('replaces shipping loading text with a shipping skeleton', () => {
    const source = read('src/components/settings/ShippingSettingsWorkspace.js')
    const skeleton = read('src/components/settings/ShippingSettingsWorkspaceSkeleton.js')
    expect(source).toContain("import ShippingSettingsWorkspaceSkeleton")
    expect(source).toContain('<ShippingSettingsWorkspaceSkeleton />')
    expect(skeleton).toContain('data-testid="shipping-settings-skeleton"')
    expect(skeleton).toContain('SettingsProviderRowsSkeleton rows={3}')
    expect(skeleton).not.toContain('Loading shipping settings...')
  })

  it('replaces team loading text with a team skeleton', () => {
    const source = read('src/components/settings/TeamSettingsPanel.js')
    expect(source).toContain('<SettingsPageSkeleton section="team" />')
    expect(source).not.toContain('Loading team')
  })

  it('uses row-level payments provider skeletons while status hydrates', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    expect(source).toContain('showPaymentsProviderRowsSkeleton')
    expect(source).toContain('<SettingsProviderRowsSkeleton rows={3} />')
    expect(source).not.toContain('showStripeRuntimeChecking')
    expect(source).not.toContain('Checking Stripe runtime status...')
    expect(source).not.toContain('Checking Stripe runtime, webhook, and account status...')
    expect(source).not.toContain('SettingsCardSkeleton actions={1} chips={3} rows={3}')
  })

  it('renders payments cards without waiting for runtime-status completion', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    expect(source).toContain("activeSection === 'payments' ? (")
    expect(source).toContain('<AdminCard as="section" className={`${styles.paymentSectionCard} ${styles.compactSettingsCard}`} variant="card">')
    expect(source).not.toContain('showStripeRuntimeChecking')
    expect(source).not.toContain('showPaymentsInitialProviderSkeleton')
  })

  it('loads Stripe status from the fast endpoint and defers full provider matrix outside initial payments render', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    expect(source).toContain("if (activeSection !== 'payments' || stripeRuntimeLoaded)")
    expect(source).toContain("fetch('/api/settings/payments/stripe/status'")
    expect(source).toContain("const shouldLoadProviderMatrix = ['shipping', 'email'].includes(activeSection);")
    expect(source).toContain("refreshProviderStatuses({ includeRuntime: false })")
  })

  it('uses webhooks skeleton in integrations panel loading states', () => {
    const source = read('src/components/settings/IntegrationsPanel.js')
    expect(source).toContain('<SettingsPageSkeleton section="webhooks" />')
    expect(source).not.toContain('Loading endpoints...')
    expect(source).not.toContain('Checking retries and failures...')
  })

  it('keeps shipping shell visible while provider readiness checks finish', () => {
    const source = read('src/components/settings/ShippingSettingsWorkspace.js')
    expect(source).toContain('setSetupStatusLoading(true)')
    expect(source).toContain('Loading saved status...')
    expect(source).toContain('providerVerificationPresentation')
    expect(source).toContain('const setupStatusPending = setupStatusLoading && !setupStatus;')
    expect(source).toContain('label: "Loading saved status..."')
  })

  it('keeps Stripe and email provider badges neutral until saved status snapshots load', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    expect(source).toContain("const stripeSavedStatusPending =")
    expect(source).toContain("!stripeDisplayedRuntimeStatus && !stripeProviderStatus && (stripeRuntimeLoading || !stripeRuntimeLoaded);")
    expect(source).toContain("label: 'Loading saved status...'")
    expect(source).toContain("detail: 'Loading saved Stripe status.'")
    expect(source).toContain("const emailProviderStatusPending = !emailStatus && !providerStatusLoaded && (providerStatusLoading || activeSection === 'email');")
    expect(source).toContain("detail: 'Loading saved provider verification status.'")
  })

  it('defines provider-row skeleton structure that matches payments row layout', () => {
    const skeletons = read('src/components/settings/SettingsSkeletons.js')
    const css = read('src/components/settings/SettingsWorkspace.module.css')

    expect(skeletons).toContain('export function SettingsProviderRowsSkeleton')
    expect(skeletons).toContain('settingsSkeletonProviderIcon')
    expect(skeletons).toContain('settingsSkeletonProviderName')
    expect(skeletons).toContain('settingsSkeletonProviderStatus')
    expect(skeletons).toContain('settingsSkeletonProviderAction')

    expect(css).toContain('.settingsSkeletonProviderRow')
    expect(css).toContain('.settingsSkeletonProviderIcon')
    expect(css).toContain('.settingsSkeletonProviderStatus')
    expect(css).toContain('.settingsSkeletonProviderAction')
  })

  it('keeps drawer-only credential writes action-driven and out of initial tab effects', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')

    const credentialsCallCount = (source.match(/\/api\/settings\/providers\/\$\{provider\}\/credentials/g) || []).length
    expect(credentialsCallCount).toBe(1)
    expect(source).toContain("method: 'POST'")
    expect(source).not.toContain("fetch(`/api/settings/providers/${provider}/credentials`, { cache: 'no-store' })")
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('settings setup copy', () => {
  it('focuses setup on first-run guide and diagnostics sections', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    const firstRunGuidePanel = read('src/components/settings/SetupFirstRunGuidePanel.js')
    const pageHeaderSource = read('src/components/settings/SettingsWorkspacePageHeader.js')

    expect(source).toContain('Launch setup')
    expect(source).toContain('Deployment validation')
    expect(source).toContain('Advanced diagnostics')
    expect(pageHeaderSource).toContain('Refresh diagnostics')
    expect(source).toContain('<SetupFirstRunGuidePanel')
    expect(firstRunGuidePanel).toContain('Setup Guide')
  })

  it('does not render merchant-facing launch checklist or run-launch-check buttons', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')

    expect(source).not.toContain('/api/readiness')
    expect(source).not.toContain('/api/readiness/run')
    expect(source).not.toContain('Run launch check')
    expect(source).not.toContain('Launch checklist')
    expect(source).not.toContain('Required before launch')
    expect(source).not.toContain('Recommended before launch')
  })

  it('renders collapsible setup affordances with chevrons and expanded-state accessibility', () => {
    const source = read('src/components/settings/SettingsWorkspace.js')
    const firstRunGuidePanel = read('src/components/settings/SetupFirstRunGuidePanel.js')
    const cssSource = read('src/components/settings/SettingsWorkspace.module.css')

    expect(source).toContain('isOpen={setupSectionExpanded.firstRunGuide}')
    expect(source).toContain('aria-expanded={setupSectionExpanded.deploymentValidation}')
    expect(source).toContain('aria-expanded={setupSectionExpanded.advancedDiagnostics}')
    expect(firstRunGuidePanel).toContain('setupChevronIcon')
    expect(firstRunGuidePanel).toContain('aria-expanded={isOpen}')
    expect(cssSource).toContain('.setupChevronIcon')
    expect(cssSource).toContain('.setupCollapsibleSection[open] .setupChevronIcon')
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('delivery logs copy + labels', () => {
  it('renames system sidebar label to Delivery logs', () => {
    const sidebar = read('src/components/Sidebar/Sidebar.js')
    expect(sidebar).toContain("{ href: '/admin/webhooks', label: 'Delivery logs'")
  })

  it('renames header and command palette labels to Delivery logs', () => {
    const header = read('src/components/Header/Header.js')
    const palette = read('src/components/admin/ui/AdminCommandPalette.tsx')

    expect(header).toContain("{ match: '/admin/webhooks', label: 'Delivery logs'")
    expect(palette).toContain('label: "Open Delivery logs"')
  })

  it('uses monitoring-not-setup copy and setup links on the delivery logs workspace', () => {
    const workspace = read('src/components/webhooks/WebhookDeliveriesWorkspace.js')

    expect(workspace).toContain('title={DELIVERY_LOGS_TITLE}')
    expect(workspace).toContain('This page is for monitoring')
    expect(workspace).toContain('EMAIL_JOB_HEALTH_TITLE')
    expect(workspace).toContain('Transactional email is async')
    expect(workspace).toContain('Settings -> Webhooks')
    expect(workspace).toContain('Manage outbound webhooks')
    expect(workspace).toContain('Set up email')
    expect(workspace).toContain('Set up payments')
  })

  it('keeps stat labels as Received/Processed/Retrying/Failed and does not use Page as a stat', () => {
    const workspace = read('src/components/webhooks/WebhookDeliveriesWorkspace.js')
    expect(workspace).toContain("DELIVERY_LOG_METRIC_LABELS = ['Received', 'Processed', 'Retrying', 'Failed']")
    expect(workspace).not.toContain('AdminStatCard label="Page"')
  })
})

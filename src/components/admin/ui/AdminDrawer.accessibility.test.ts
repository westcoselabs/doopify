import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'components', 'admin', 'ui', 'AdminDrawer.tsx'),
  'utf8'
)

describe('AdminDrawer accessibility contract', () => {
  it('uses an accessible dialog label and isolates background content', () => {
    expect(source).toContain('aria-labelledby={showTitle ? titleId : undefined}')
    expect(source).toContain('element.setAttribute("aria-hidden", "true")')
    expect(source).toContain('element.setAttribute("inert", "")')
  })

  it('traps and restores focus while open', () => {
    expect(source).toContain('previouslyFocusedElementRef')
    expect(source).toContain('previous.focus()')
    expect(source).toContain('event.key !== "Tab"')
    expect(source).toContain('last.focus()')
    expect(source).toContain('first.focus()')
  })

  it('uses one guarded close path for escape, overlay, and close button actions', () => {
    expect(source).toContain('if (isDirty && !window.confirm("Discard unsaved changes?"))')
    expect(source).toContain('onClick={requestClose}')
    expect(source).toContain('event.key === "Escape"')
  })

  it('implements tab roles and keyboard navigation', () => {
    expect(source).toContain('role="tablist"')
    expect(source).toContain('role="tab"')
    expect(source).toContain('role={hasTabs ? "tabpanel" : undefined}')
    expect(source).toContain('event.key === "ArrowRight"')
    expect(source).toContain('event.key === "Home"')
    expect(source).toContain('event.key === "End"')
  })
})

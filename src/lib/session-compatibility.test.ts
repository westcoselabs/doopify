import { describe, expect, it } from 'vitest'

import { legacySessionCompatibilityAllowed } from './session-compatibility'

describe('legacy session compatibility cutoff', () => {
  const now = Date.parse('2030-01-01T00:00:00.000Z')

  it('accepts only an explicit future absolute cutoff', () => {
    expect(legacySessionCompatibilityAllowed('2030-01-02T00:00:00.000Z', now)).toBe(true)
  })

  it('rejects expired, missing, and invalid cutoffs without recalculating them', () => {
    expect(legacySessionCompatibilityAllowed('2029-12-31T23:59:59.000Z', now)).toBe(false)
    expect(legacySessionCompatibilityAllowed(undefined, now)).toBe(false)
    expect(legacySessionCompatibilityAllowed('not-a-timestamp', now)).toBe(false)
  })
})

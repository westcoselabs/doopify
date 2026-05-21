import { describe, expect, it } from 'vitest'

import { evaluateEmailJobHealth } from './email-job-health.service'

describe('email job health service', () => {
  it('returns healthy when due queue and failures are clear', () => {
    const result = evaluateEmailJobHealth({
      dueCount: 0,
      failedCount: 0,
      oldestDueAgeMinutes: null,
      runnerHealth: 'healthy',
    })

    expect(result.level).toBe('healthy')
    expect(result.message).toContain('healthy')
  })

  it('returns warning when due backlog crosses warning threshold', () => {
    const result = evaluateEmailJobHealth({
      dueCount: 6,
      failedCount: 0,
      oldestDueAgeMinutes: 4,
      runnerHealth: 'healthy',
    })

    expect(result.level).toBe('warning')
    expect(result.message).toContain('due email job')
  })

  it('returns critical when due backlog is present and runner is idle', () => {
    const result = evaluateEmailJobHealth({
      dueCount: 2,
      failedCount: 0,
      oldestDueAgeMinutes: 12,
      runnerHealth: 'idle',
    })

    expect(result.level).toBe('critical')
    expect(result.message).toContain('runner health idle')
  })

  it('returns critical when failed or exhausted jobs cross threshold', () => {
    const result = evaluateEmailJobHealth({
      dueCount: 0,
      failedCount: 5,
      oldestDueAgeMinutes: null,
      runnerHealth: 'healthy',
    })

    expect(result.level).toBe('critical')
    expect(result.message).toContain('failed/exhausted email job')
  })
})

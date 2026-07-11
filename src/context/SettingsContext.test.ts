import { describe, expect, it } from 'vitest'

import { buildSettingsPatchPayload, requireSettingsApiData, transformStore } from './settings-context.helpers'

describe('SettingsContext helpers', () => {
  it('builds PATCH payload with selected currency code', () => {
    const payload = buildSettingsPatchPayload({
      currency: 'GBP',
      timezone: 'Europe/London',
    })

    expect(payload.currency).toBe('GBP')
    expect(payload.timezone).toBe('Europe/London')
  })

  it('maps store settings and falls back to USD when currency is missing', () => {
    const mapped = transformStore({
      id: 'store_1',
      name: 'Doopify',
      email: 'support@example.com',
      timezone: 'America/New_York',
      currency: null,
    })

    expect(mapped.currency).toBe('USD')
  })

  it('accepts only successful settings API responses with data', () => {
    expect(
      requireSettingsApiData(true, {
        success: true,
        data: { id: 'store_1', name: 'Doopify' },
      })
    ).toMatchObject({ id: 'store_1' })

    expect(() => requireSettingsApiData(false, { success: true, data: { id: 'store_1' } })).toThrow(
      /failed to save settings/i
    )
    expect(() => requireSettingsApiData(true, { success: false, error: 'Settings are locked' })).toThrow(
      /settings are locked/i
    )
  })
})

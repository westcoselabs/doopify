import { describe, expect, it } from 'vitest'

import { isSettingsTabLoadingState } from './settings-skeleton.helpers'

describe('settings skeleton loading state', () => {
  it('shows skeleton for initial general loading', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'general',
        loading: true,
      })
    ).toBe(true)
  })

  it('does not block payments behind page skeleton while provider/activity data loads', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'payments',
        providerStatusLoading: true,
        providerStatusLoaded: false,
      })
    ).toBe(false)
  })

  it('does not block taxes behind page skeleton while shipping config loads', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'taxes',
        shippingConfigLoading: true,
        shippingConfigLoaded: false,
      })
    ).toBe(false)
  })

  it('does not block email behind page skeleton while provider/activity data loads', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'email',
        emailActivityLoading: true,
        emailActivityLoaded: false,
      })
    ).toBe(false)
  })

  it('does not block brand kit behind page skeleton while data loads', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'brand-kit',
        brandKitLoading: true,
        brandKitLoaded: false,
      })
    ).toBe(false)
  })

  it('shows skeleton for account until session user resolves', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'account',
        sessionUser: null,
      })
    ).toBe(true)
  })

  it('does not block setup behind page skeleton while setup panels load', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'setup',
        setupLoading: true,
        setupLoaded: false,
      })
    ).toBe(false)
  })

  it('does not block setup while diagnostics are still loading', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'setup',
        setupLoading: true,
        setupLoaded: false,
      })
    ).toBe(false)
  })

  it('does not show skeleton once tab data is loaded', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'payments',
        providerStatusLoading: false,
        providerStatusLoaded: true,
        paymentActivityLoading: false,
        paymentActivityLoaded: true,
      })
    ).toBe(false)
  })

  it('does not show skeleton when a hard error is present', () => {
    expect(
      isSettingsTabLoadingState({
        activeSection: 'general',
        loading: true,
        hasError: true,
      })
    ).toBe(false)
  })
})

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const WORKSPACE = 'src/components/settings/ShippingSettingsWorkspace.js'

describe('shipping settings UX copy and validation', () => {
  it('uses "Destination country" label (not the old "Region country")', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('label="Destination country"')
    expect(source).not.toContain('label="Region country"')
  })

  it('uses "State / province (optional)" label (not "Region state / province")', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('label="State / province (optional)"')
    expect(source).not.toContain('label="Region state / province"')
  })

  it('explains blank state / province matches all states', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Leave blank to match all states or provinces')
  })

  it('uses "Min order total" / "Max order total" labels for price-based rates', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('label="Min order total ($)"')
    expect(source).toContain('label="Max order total ($)"')
    // Old "subtotal" labels should be gone from drawer fields
    expect(source).not.toContain('label="Min subtotal ($)"')
    expect(source).not.toContain('label="Max subtotal ($)"')
  })

  it('explains max order total blank or 0 means no maximum', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Leave blank or enter 0 for no maximum')
  })

  it('removes advanced free-over conditions from the first-run manual rate drawer', () => {
    const source = read(WORKSPACE)
    expect(source).not.toContain('Advanced conditions')
    expect(source).not.toContain('showAdvancedConditions')
  })

  it('resets conditions when rate type changes to avoid stale field values', () => {
    const source = read(WORKSPACE)
    // onChange for the rate type select should clear condition fields
    expect(source).toContain("minWeight: \"\", maxWeight: \"\", minSubtotal: \"\", maxSubtotal: \"\", freeOverAmount: \"\"")
  })

  it('has client-side validateManualRate function', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('function validateManualRate()')
    expect(source).toContain('"Rate name is required."')
    expect(source).toContain('"Amount must be 0 or greater."')
    expect(source).toContain('"Min weight is required for weight-based rates.')
  })

  it('calls validateManualRate before saving and shows error in the drawer', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('const validationError = validateManualRate()')
    expect(source).toContain('setManualDrawerError(validationError)')
    expect(source).toContain('manualDrawerError')
  })

  it('resets manualDrawerError when drawer opens', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('setManualDrawerError("")')
  })

  it('improves weight-based warning to mention setting min weight to 0', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('set min weight to 0')
  })

  it('keeps flat rate the first / default option in the rate type selector', () => {
    const source = read(WORKSPACE)
    // FLAT should appear before FREE, PRICE_BASED, WEIGHT_BASED in the options array
    const flatIdx = source.indexOf('value: "FLAT"')
    const freeIdx = source.indexOf('value: "FREE"')
    const priceIdx = source.indexOf('value: "PRICE_BASED"')
    const weightIdx = source.indexOf('value: "WEIGHT_BASED"')
    expect(flatIdx).toBeGreaterThan(-1)
    expect(flatIdx).toBeLessThan(freeIdx)
    expect(flatIdx).toBeLessThan(priceIdx)
    expect(flatIdx).toBeLessThan(weightIdx)
  })

  it('keeps DEFAULT_MANUAL_RATE_FORM defaulting to FLAT rate type', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('rateType: "FLAT"')
  })

  it('sends amount 0 for FREE rates so save does not fail validation', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('amount: manualForm.rateType === "FREE" ? 0 : parseNumber(manualForm.amount)')
  })

  it('keeps price and weight condition fields scoped to their own rate types', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('manualForm.rateType === "PRICE_BASED"')
    expect(source).toContain('manualForm.rateType === "WEIGHT_BASED"')
  })

  it('saves manual rates through the manual-rates API route', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('"/api/settings/shipping/manual-rates"')
  })

  it('only closes manual drawer after a successful save response', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('if (result.success)')
    expect(source).toContain('setManualDrawerOpen(false)')
  })

  it('explains provider usage options with explicit live-rate vs label-buying behavior', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Live rates and label buying: checkout live rates + label purchase.')
    expect(source).toContain('Label buying only: labels only, no')
    expect(source).toContain('checkout live rates.')
    expect(source).toContain('Live rates only: checkout live rates only, no label purchase.')
  })

  it('explains that saved provider keys stay hidden after save', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Saved keys are hidden after saving. Enter a new key only to replace the current one.')
  })

  it('shows clear connected/not connected status copy in provider drawer', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Connection status')
    expect(source).toContain('label: "Connected"')
    expect(source).toContain('label: "Not connected"')
  })

  it('explains Shippo USPS ship-from email + phone requirement', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Shippo/USPS labels require a ship-from email and phone number.')
    expect(source).toContain('Ship-from phone is required for Shippo/USPS labels.')
  })

  it('keeps provider token field empty after loading and saving settings', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('token: ""')
    expect(source).toContain('setProviderForm((current) => ({ ...current, token: "" }))')
  })

  it('uses non-fatal address pre-validation guidance in the location drawer', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Address pre-validation is not available yet.')
    expect(source).toContain('verify it by loading live checkout')
    expect(source).toContain('rates or purchasing a test label.')
  })

  it('shows requested helper copy for Manual, Live carrier rates, and Hybrid mode cards', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('Customers see your fixed manual rates at checkout.')
    expect(source).toContain('Customers see real-time rates from your selected provider.')
    expect(source).toContain('Doopify tries live rates first, then falls back to manual rates if allowed.')
  })

  it('marks checkout method as dirty when mode or fallback behavior changes', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('setModeSaveState("dirty")')
    expect(source).toContain('setFallbackBehavior(value)')
  })

  it('registers shipping mode save callbacks for parent save-state/header actions', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('onModeSaveStateChange')
    expect(source).toContain('onRegisterSaveAction')
    expect(source).toContain('onRegisterSaveAction(() => saveCheckoutMethodRef.current?.())')
    expect(source).toContain('onModeSaveStateChange(modeSaveState')
  })

  it('uses explicit save-state transitions for checkout method save success and failure', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('setModeSaveState("saving")')
    expect(source).toContain('setModeSaveState("saved_just_now")')
    expect(source).toContain('setModeSaveState("error")')
  })

  it('keeps saved provider status neutral while setup status is loading', () => {
    const source = read(WORKSPACE)
    expect(source).toContain('const setupStatusPending = setupStatusLoading && !setupStatus;')
    expect(source).toContain('label: "Loading saved status..."')
    expect(source).toContain('setupStatusPending ? "Loading"')
    expect(source).toContain('setupStatusPending ? "neutral"')
  })
})

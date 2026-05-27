import { describe, expect, it } from 'vitest'

import {
  getShippingHeaderSaveButtonState,
  invokeShippingSaveAction,
  resolveShippingSaveActionRegistration,
} from './shipping-save-button.helpers'

describe('shipping header save button helper', () => {
  it('marks save action as ready when a callback is registered', () => {
    const action = () => true
    const result = resolveShippingSaveActionRegistration(action)

    expect(result.saveAction).toBe(action)
    expect(result.saveActionReady).toBe(true)
  })

  it('marks save action as not ready when callback is removed', () => {
    const result = resolveShippingSaveActionRegistration(null)

    expect(result.saveAction).toBeNull()
    expect(result.saveActionReady).toBe(false)
  })

  it('enables Save changes when shipping mode is dirty and a save action exists', () => {
    const state = getShippingHeaderSaveButtonState({
      loading: false,
      hasError: false,
      hasSaveAction: true,
      shippingModeSavedState: 'dirty',
      shippingModeDirty: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Save changes')
  })

  it('keeps Save changes disabled before save action registration even when dirty', () => {
    const state = getShippingHeaderSaveButtonState({
      hasSaveAction: false,
      shippingModeSavedState: 'dirty',
      shippingModeDirty: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Save changes')
  })

  it('shows a disabled Saved state when there are no unsaved shipping changes', () => {
    const state = getShippingHeaderSaveButtonState({
      hasSaveAction: true,
      shippingModeSavedState: 'saved',
      shippingModeDirty: false,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Saved')
  })

  it('keeps Save changes enabled for shipping mode edits when the save action is ready', () => {
    const state = getShippingHeaderSaveButtonState({
      hasSaveAction: true,
      shippingModeSavedState: 'dirty',
      shippingModeDirty: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Save changes')
  })

  it('shows Saving... and disables the button while save is in flight', () => {
    const state = getShippingHeaderSaveButtonState({
      hasSaveAction: true,
      shippingModeSavedState: 'saving',
      shippingModeDirty: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Saving...')
  })

  it('keeps Save changes label after a failed save so retry stays clear', () => {
    const state = getShippingHeaderSaveButtonState({
      hasSaveAction: true,
      shippingModeSavedState: 'error',
      shippingModeDirty: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Save changes')
  })

  it('invokes the registered save action when header save is clicked', () => {
    let called = 0
    const action = () => {
      called += 1
      return 'saved'
    }

    const result = invokeShippingSaveAction(action)

    expect(called).toBe(1)
    expect(result).toBe('saved')
  })
})

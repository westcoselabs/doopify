import { describe, expect, it } from 'vitest'

import {
  buildStripeCredentialSavePayload,
  buildMaskedCredentialMap,
  buildStripeMaskedCredentialMap,
  resolveStripeConnectionState,
  resolveMaskedInputPlaceholder,
  shouldConfirmStripeCredentialReplacement,
  shouldShowStripeCredentialInput,
} from './stripe-credential-masking.helpers'

describe('stripe credential masking helpers', () => {
  it('keeps only present masked entries and ignores missing values', () => {
    const map = buildMaskedCredentialMap([
      { key: 'PUBLISHABLE_KEY', present: true, maskedValue: 'pk_test_******1234' },
      { key: 'SECRET_KEY', present: false, maskedValue: 'sk_test_******5678' },
      { key: 'WEBHOOK_SECRET', present: true, maskedValue: null },
    ])

    expect(map).toEqual({
      PUBLISHABLE_KEY: 'pk_test_******1234',
    })
  })

  it('shows saved masked placeholders when fields are intentionally cleared after save', () => {
    const placeholder = resolveMaskedInputPlaceholder({
      draftValue: '',
      fallbackPlaceholder: 'sk_test_...',
      savedMaskedValue: 'sk_test_******1234',
    })

    expect(placeholder).toBe('sk_test_******1234')
  })

  it('uses the generic placeholder while typing a new replacement secret', () => {
    const placeholder = resolveMaskedInputPlaceholder({
      draftValue: 'sk_test_new_value',
      fallbackPlaceholder: 'sk_test_...',
      savedMaskedValue: 'sk_test_******1234',
    })

    expect(placeholder).toBe('sk_test_...')
  })

  it('never surfaces raw secret values through placeholder mapping', () => {
    const rawSecret = 'sk_test_raw_secret_never_show_this'
    const map = buildMaskedCredentialMap([
      {
        key: 'SECRET_KEY',
        present: true,
        maskedValue: 'sk_test_******1234',
        // @ts-expect-error raw values are ignored by the helper contract
        rawValue: rawSecret,
      },
    ])

    expect(map.SECRET_KEY).toBe('sk_test_******1234')
    expect(JSON.stringify(map)).not.toContain(rawSecret)
  })

  it('hydrates masked Stripe values from runtime snapshot when provider credential meta is temporarily empty', () => {
    const map = buildStripeMaskedCredentialMap({
      credentialMeta: [],
      runtimeProviderStatus: {
        publishableKeyMasked: 'pk_test_******1234',
        secretKeyMasked: 'sk_test_******5678',
        webhookSecretMasked: 'whsec_******9012',
        mode: 'test',
      },
    })

    expect(map).toEqual({
      PUBLISHABLE_KEY: 'pk_test_******1234',
      SECRET_KEY: 'sk_test_******5678',
      WEBHOOK_SECRET: 'whsec_******9012',
      MODE: 'test',
    })
  })

  it('retains saved masked values across close and reopen flows', () => {
    const firstOpenMap = buildStripeMaskedCredentialMap({
      credentialMeta: [
        { key: 'PUBLISHABLE_KEY', present: true, maskedValue: 'pk_test_******1234' },
        { key: 'SECRET_KEY', present: true, maskedValue: 'sk_test_******5678' },
        { key: 'MODE', present: true, maskedValue: 'test' },
      ],
      runtimeProviderStatus: null,
    })

    const reopenMap = buildStripeMaskedCredentialMap({
      credentialMeta: [],
      runtimeProviderStatus: {
        publishableKeyMasked: 'pk_test_******1234',
        secretKeyMasked: 'sk_test_******5678',
        mode: 'test',
      },
    })

    expect(reopenMap.PUBLISHABLE_KEY).toBe(firstOpenMap.PUBLISHABLE_KEY)
    expect(reopenMap.SECRET_KEY).toBe(firstOpenMap.SECRET_KEY)
    expect(reopenMap.MODE).toBe('test')
  })

  it('hydrates from runtime status snapshots when nested provider status is returned', () => {
    const map = buildStripeMaskedCredentialMap({
      credentialMeta: [],
      runtimeStatus: {
        mode: 'live',
        providerStatus: {
          publishableKeyMasked: 'pk_live_******1234',
          secretKeyMasked: 'sk_live_******5678',
          webhookSecretMasked: 'whsec_******9012',
        },
      },
    })

    expect(map).toEqual({
      PUBLISHABLE_KEY: 'pk_live_******1234',
      SECRET_KEY: 'sk_live_******5678',
      WEBHOOK_SECRET: 'whsec_******9012',
      MODE: 'live',
    })
  })

  it('builds Stripe save payloads without sending empty unchanged fields', () => {
    const payload = buildStripeCredentialSavePayload({
      publishableKey: '',
      secretKey: '   ',
      webhookSecret: '',
      mode: 'test',
    })

    expect(payload).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      webhookSecret: undefined,
      mode: 'test',
    })
  })

  it('does not submit masked saved display values as real Stripe secrets', () => {
    const payload = buildStripeCredentialSavePayload({
      publishableKey: 'pk_test_••••WQ73',
      secretKey: 'sk_test_••••3XHw',
      webhookSecret: 'whsec_••••uTip',
      savedMaskMap: {
        PUBLISHABLE_KEY: 'pk_test_••••WQ73',
        SECRET_KEY: 'sk_test_••••3XHw',
        WEBHOOK_SECRET: 'whsec_••••uTip',
      },
      mode: 'test',
    })

    expect(payload).toEqual({
      publishableKey: undefined,
      secretKey: undefined,
      webhookSecret: undefined,
      mode: 'test',
    })
  })

  it('normalizes Stripe mode to test/live only for save payloads', () => {
    const payload = buildStripeCredentialSavePayload({
      publishableKey: 'pk_live_new_1234',
      secretKey: 'sk_live_new_5678',
      webhookSecret: 'whsec_new_9012',
      mode: 'LIVE',
    })

    expect(payload).toEqual({
      publishableKey: 'pk_live_new_1234',
      secretKey: 'sk_live_new_5678',
      webhookSecret: 'whsec_new_9012',
      mode: 'live',
    })
  })

  it('does not keep Stripe in NOT_CONFIGURED when saved masked API keys are present', () => {
    const state = resolveStripeConnectionState({
      providerState: 'NOT_CONFIGURED',
      credentialMaskMap: {
        PUBLISHABLE_KEY: 'pk_test_******1234',
        SECRET_KEY: 'sk_test_******5678',
      },
    })

    expect(state).toBe('CREDENTIALS_SAVED')
  })

  it('renders saved credential display when masked value exists and replace is not active', () => {
    const showInput = shouldShowStripeCredentialInput({
      savedMaskedValue: 'pk_test_••••WQ73',
      draftValue: '',
      isReplacing: false,
    })

    expect(showInput).toBe(false)
  })

  it('replace action reveals editable input for saved credentials', () => {
    const showInput = shouldShowStripeCredentialInput({
      savedMaskedValue: 'sk_test_••••3XHw',
      draftValue: '',
      isReplacing: true,
    })

    expect(showInput).toBe(true)
  })

  it('requires confirmation only when a replacement submits a new saved credential', () => {
    expect(
      shouldConfirmStripeCredentialReplacement({
        replacementByField: { secretKey: true },
        payload: { secretKey: 'sk_test_replacement' },
      })
    ).toBe(true)

    expect(
      shouldConfirmStripeCredentialReplacement({
        replacementByField: { secretKey: true },
        payload: { secretKey: '' },
      })
    ).toBe(false)
  })

  it('cancel replacement returns to saved credential display state', () => {
    const showInput = shouldShowStripeCredentialInput({
      savedMaskedValue: 'whsec_••••uTip',
      draftValue: '',
      isReplacing: false,
    })

    expect(showInput).toBe(false)
  })

  it('shows an editable input when no saved credential exists', () => {
    const showInput = shouldShowStripeCredentialInput({
      savedMaskedValue: '',
      draftValue: '',
      isReplacing: false,
    })

    expect(showInput).toBe(true)
  })
})

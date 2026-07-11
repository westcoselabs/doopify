import { describe, expect, it } from 'vitest';

import {
  describeProviderGatewayStatus,
  isLikelyVerificationTimeout,
} from './provider-status-view-model';

describe('provider status view model', () => {
  it('keeps a saved verified connection in a retryable warning state', () => {
    expect(
      describeProviderGatewayStatus({
        state: 'ERROR',
        source: 'db',
        lastVerifiedAt: '2026-07-11T00:00:00.000Z',
        lastError: 'Provider request timed out',
      })
    ).toEqual({
      label: 'Verification unavailable',
      tone: 'warning',
      detail: 'Saved configuration is present, but verification is temporarily unavailable.',
      sourceLabel: 'DB credentials',
      lastVerifiedAt: '2026-07-11T00:00:00.000Z',
    });
  });

  it('keeps definitive failures distinct from retryable failures', () => {
    const status = describeProviderGatewayStatus({
      state: 'ERROR',
      source: 'db',
      lastError: 'Credential rejected by provider',
    });

    expect(status.label).toBe('Error');
    expect(status.tone).toBe('danger');
    expect(status.detail).toBe('Credential rejected by provider');
    expect(isLikelyVerificationTimeout(status.detail)).toBe(false);
  });

  it('shows unreadable ciphertext without exposing a credential value', () => {
    const status = describeProviderGatewayStatus({
      credentialStorageState: 'UNREADABLE',
      source: 'db',
      lastVerifiedAt: null,
    });

    expect(status.label).toBe('Credentials need replacement');
    expect(JSON.stringify(status)).not.toContain('sk_');
  });
});

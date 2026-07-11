const PROVIDER_STATE_TONE = {
  VERIFIED: 'success',
  CREDENTIALS_SAVED: 'warning',
  ERROR: 'danger',
  NOT_CONFIGURED: 'warning',
};

const PROVIDER_SOURCE_LABEL = {
  db: 'DB credentials',
  env: 'Env fallback',
  none: 'Not active',
};

function normalizeStatusLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
}

export function isLikelyVerificationTimeout(value) {
  const normalized = normalizeStatusLabel(value);
  return Boolean(
    normalized &&
      (normalized.includes('timeout') ||
        normalized.includes('timed out') ||
        normalized.includes('network') ||
        normalized.includes('temporarily unavailable'))
  );
}

export function describeProviderGatewayStatus(providerStatus, fallbackStatus) {
  if (!providerStatus) return fallbackStatus;

  if (providerStatus.credentialStorageState === 'UNREADABLE') {
    return {
      label: 'Credentials need replacement',
      tone: 'danger',
      detail: 'Saved credentials cannot be decrypted with the current encryption key. Restore the original key or replace the credentials.',
      sourceLabel: PROVIDER_SOURCE_LABEL[providerStatus.source] || 'DB credentials',
      lastVerifiedAt: providerStatus.lastVerifiedAt || null,
    };
  }

  const verificationTimeoutLike =
    providerStatus.state === 'ERROR' && isLikelyVerificationTimeout(providerStatus.lastError);
  const stateLabelMap = {
    VERIFIED: 'Verified',
    CREDENTIALS_SAVED: 'Credentials saved',
    ERROR: verificationTimeoutLike ? 'Verification unavailable' : 'Error',
    NOT_CONFIGURED: 'Not configured',
  };
  const sourceLabel = PROVIDER_SOURCE_LABEL[providerStatus.source] || 'Not active';
  let detail = `Source: ${sourceLabel}.`;

  if (providerStatus.state === 'VERIFIED') {
    detail = `Verified connection. Source: ${sourceLabel}.`;
  } else if (providerStatus.state === 'CREDENTIALS_SAVED') {
    detail = 'Credentials saved. API verification has not been completed from this screen.';
  } else if (providerStatus.state === 'ERROR') {
    detail = verificationTimeoutLike
      ? 'Saved configuration is present, but verification is temporarily unavailable.'
      : providerStatus.lastError || 'Provider verification failed. Review credentials and retry.';
  }

  return {
    label: stateLabelMap[providerStatus.state] || 'Not configured',
    tone: verificationTimeoutLike ? 'warning' : PROVIDER_STATE_TONE[providerStatus.state] || 'warning',
    detail,
    sourceLabel,
    lastVerifiedAt: providerStatus.lastVerifiedAt || null,
  };
}

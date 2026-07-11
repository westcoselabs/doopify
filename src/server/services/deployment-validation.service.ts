export type DeploymentCheckStatus = 'ready' | 'needs_setup' | 'optional' | 'skipped'

export type DeploymentCheck = {
  id: string
  title: string
  status: DeploymentCheckStatus
  summary: string
  fix?: string
  optional: boolean
}

export type DeploymentValidationReport = {
  checks: DeploymentCheck[]
  readyCount: number
  needsSetupCount: number
  optionalCount: number
  skippedCount: number
  blockerCount: number
  deploymentReady: boolean
}

export type DeploymentValidationFacts = {
  isProduction: boolean

  encryptionKeyPresent: boolean

  mediaStorageProvider: string | null
  mediaBlobTokenPresent: boolean
  mediaS3RegionPresent: boolean
  mediaS3BucketPresent: boolean
  mediaS3AccessKeyIdPresent: boolean
  mediaS3SecretAccessKeyPresent: boolean

  rateLimitStore: string | null

  cspMode: string | null

  webhookRetrySecretPresent: boolean
  jobRunnerSecretPresent: boolean
  abandonedCheckoutSecretPresent: boolean
}

function evaluateEncryptionKey(facts: DeploymentValidationFacts): DeploymentCheck {
  if (facts.encryptionKeyPresent) {
    return {
      id: 'encryption-key',
      title: 'Encryption key',
      optional: false,
      status: 'ready',
      summary: 'ENCRYPTION_KEY is set. Integration secrets are encrypted at rest.',
    }
  }

  if (facts.isProduction) {
    return {
      id: 'encryption-key',
      title: 'Encryption key',
      optional: false,
      status: 'needs_setup',
      summary: 'ENCRYPTION_KEY is missing. Integration secrets cannot be safely encrypted in production.',
      fix: 'Set ENCRYPTION_KEY to a high-entropy random value before configuring providers in production.',
    }
  }

  return {
    id: 'encryption-key',
    title: 'Encryption key',
    optional: false,
    status: 'needs_setup',
    summary: 'ENCRYPTION_KEY is not set. Provider credentials and other encrypted data cannot be used safely.',
    fix: 'Set ENCRYPTION_KEY to a high-entropy random value before saving credentials or enabling encrypted features.',
  }
}

function evaluateObjectStorage(facts: DeploymentValidationFacts): DeploymentCheck {
  const provider = facts.mediaStorageProvider?.toLowerCase() ?? 'postgres'

  if (provider === 'vercel-blob' || provider === 'blob') {
    if (facts.mediaBlobTokenPresent) {
      return {
        id: 'object-storage',
        title: 'Object storage',
        optional: true,
        status: 'ready',
        summary: 'Vercel Blob object storage is configured. Media binaries will be stored outside Postgres.',
      }
    }

    return {
      id: 'object-storage',
      title: 'Object storage',
      optional: false,
      status: 'needs_setup',
      summary: 'MEDIA_STORAGE_PROVIDER=vercel-blob is set but BLOB_READ_WRITE_TOKEN is missing.',
      fix: 'Set BLOB_READ_WRITE_TOKEN for Vercel Blob uploads and deletes.',
    }
  }

  if (provider === 's3') {
    const hasAllRequired =
      facts.mediaS3RegionPresent &&
      facts.mediaS3BucketPresent &&
      facts.mediaS3AccessKeyIdPresent &&
      facts.mediaS3SecretAccessKeyPresent

    if (hasAllRequired) {
      return {
        id: 'object-storage',
        title: 'Object storage',
        optional: true,
        status: 'ready',
        summary: 'S3-compatible object storage is configured. Media binaries will be stored in the object store.',
      }
    }

    return {
      id: 'object-storage',
      title: 'Object storage',
      optional: false,
      status: 'needs_setup',
      summary: 'MEDIA_STORAGE_PROVIDER=s3 is set but required S3 variables are missing.',
      fix: 'Set MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.',
    }
  }

  return {
    id: 'object-storage',
    title: 'Object storage',
    optional: true,
    status: 'optional',
    summary: facts.isProduction
      ? 'Using Postgres media storage in production. Suitable for private beta but not recommended at scale. Consider configuring Vercel Blob (on Vercel) or S3/R2.'
      : 'Using Postgres media storage (default). Suitable for local development and private beta.',
    fix: facts.isProduction
      ? 'Set MEDIA_STORAGE_PROVIDER=vercel-blob with BLOB_READ_WRITE_TOKEN (Vercel) or MEDIA_STORAGE_PROVIDER=s3 with MEDIA_S3_* vars.'
      : undefined,
  }
}

function evaluateRateLimitStore(facts: DeploymentValidationFacts): DeploymentCheck {
  const store = facts.rateLimitStore?.toLowerCase() ?? null

  if (store === 'memory' && facts.isProduction) {
    return {
      id: 'rate-limit-store',
      title: 'Rate limit store',
      optional: true,
      status: 'needs_setup',
      summary:
        'DOOPIFY_RATE_LIMIT_STORE=memory is set in production. In-memory rate limits are not shared across multiple instances.',
      fix: 'Set DOOPIFY_RATE_LIMIT_STORE=postgres or remove the override to use the production default (Postgres).',
    }
  }

  if (store === 'postgres') {
    return {
      id: 'rate-limit-store',
      title: 'Rate limit store',
      optional: true,
      status: 'ready',
      summary: 'Rate limit store is explicitly set to Postgres. Shared across all instances.',
    }
  }

  if (!store && facts.isProduction) {
    return {
      id: 'rate-limit-store',
      title: 'Rate limit store',
      optional: true,
      status: 'ready',
      summary:
        'Rate limit store not explicitly set. Production default is Postgres (shared across instances).',
    }
  }

  return {
    id: 'rate-limit-store',
    title: 'Rate limit store',
    optional: true,
    status: 'optional',
    summary: 'Rate limit store not configured. Using in-memory store (suitable for single-instance dev/private beta).',
    fix: 'Set DOOPIFY_RATE_LIMIT_STORE=postgres for multi-instance production deployments.',
  }
}

function evaluateCspMode(facts: DeploymentValidationFacts): DeploymentCheck {
  const mode = facts.cspMode?.toLowerCase() ?? null

  if (mode === 'enforce') {
    return {
      id: 'csp-mode',
      title: 'CSP mode',
      optional: true,
      status: 'ready',
      summary: 'Content Security Policy is in enforce mode. Browser CSP violations will be blocked.',
    }
  }

  if (mode === 'report-only') {
    return {
      id: 'csp-mode',
      title: 'CSP mode',
      optional: true,
      status: 'optional',
      summary: 'CSP is in report-only mode. Violations are logged but not blocked. Switch to enforce after validating.',
      fix: 'Set CSP_MODE=enforce after verifying no CSP violations on critical pages.',
    }
  }

  if (mode === 'off') {
    return {
      id: 'csp-mode',
      title: 'CSP mode',
      optional: true,
      status: 'optional',
      summary: 'CSP is disabled (CSP_MODE=off). Re-enable after completing browser compatibility testing.',
      fix: 'Set CSP_MODE=report-only or CSP_MODE=enforce when ready.',
    }
  }

  if (facts.isProduction) {
    return {
      id: 'csp-mode',
      title: 'CSP mode',
      optional: true,
      status: 'optional',
      summary:
        'CSP_MODE not set. Production defaults to report-only mode. Violations are logged but not blocked.',
      fix: 'Set CSP_MODE=enforce after verifying no CSP violations on critical pages in staging.',
    }
  }

  return {
    id: 'csp-mode',
    title: 'CSP mode',
    optional: true,
    status: 'optional',
    summary: 'CSP_MODE not set. CSP is off in development by default.',
  }
}

function evaluateJobRunnerAuth(facts: DeploymentValidationFacts): DeploymentCheck {
  const hasAuth = facts.jobRunnerSecretPresent || facts.webhookRetrySecretPresent

  if (hasAuth) {
    return {
      id: 'job-runner-auth',
      title: 'Job runner auth',
      optional: true,
      status: 'ready',
      summary: facts.jobRunnerSecretPresent
        ? 'JOB_RUNNER_SECRET is set. Job runner endpoint is protected.'
        : 'Job runner endpoint is protected via WEBHOOK_RETRY_SECRET fallback.',
    }
  }

  return {
    id: 'job-runner-auth',
    title: 'Job runner auth',
    optional: true,
    status: 'needs_setup',
    summary: 'No auth secret is configured for the job runner endpoint. POST /api/jobs/run is unprotected.',
    fix: 'Set WEBHOOK_RETRY_SECRET (used as fallback) or JOB_RUNNER_SECRET explicitly.',
  }
}

function evaluateAbandonedCheckoutAuth(facts: DeploymentValidationFacts): DeploymentCheck {
  const hasAuth = facts.abandonedCheckoutSecretPresent || facts.webhookRetrySecretPresent

  if (hasAuth) {
    return {
      id: 'abandoned-checkout-auth',
      title: 'Abandoned checkout auth',
      optional: true,
      status: 'ready',
      summary: facts.abandonedCheckoutSecretPresent
        ? 'ABANDONED_CHECKOUT_SECRET is set. Abandoned checkout trigger is protected.'
        : 'Abandoned checkout trigger is protected via WEBHOOK_RETRY_SECRET fallback.',
    }
  }

  return {
    id: 'abandoned-checkout-auth',
    title: 'Abandoned checkout auth',
    optional: true,
    status: 'optional',
    summary: 'No auth secret configured for abandoned checkout trigger. POST /api/abandoned-checkouts/send-due is unprotected.',
    fix: 'Set WEBHOOK_RETRY_SECRET (used as fallback) or ABANDONED_CHECKOUT_SECRET explicitly.',
  }
}

export function buildDeploymentValidationReport(
  facts: DeploymentValidationFacts
): DeploymentValidationReport {
  const checks: DeploymentCheck[] = [
    evaluateEncryptionKey(facts),
    evaluateObjectStorage(facts),
    evaluateRateLimitStore(facts),
    evaluateCspMode(facts),
    evaluateJobRunnerAuth(facts),
    evaluateAbandonedCheckoutAuth(facts),
  ]

  const readyCount = checks.filter((c) => c.status === 'ready').length
  const needsSetupCount = checks.filter((c) => c.status === 'needs_setup').length
  const optionalCount = checks.filter((c) => c.status === 'optional').length
  const skippedCount = checks.filter((c) => c.status === 'skipped').length
  const blockerCount = checks.filter((c) => !c.optional && c.status === 'needs_setup').length

  return {
    checks,
    readyCount,
    needsSetupCount,
    optionalCount,
    skippedCount,
    blockerCount,
    deploymentReady: blockerCount === 0,
  }
}

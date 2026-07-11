import { describe, expect, it } from 'vitest'

import {
  buildDeploymentValidationReport,
  type DeploymentValidationFacts,
} from './deployment-validation.service'

function baseFacts(): DeploymentValidationFacts {
  return {
    isProduction: true,
    encryptionKeyPresent: true,
    mediaStorageProvider: 'postgres',
    mediaBlobTokenPresent: false,
    mediaS3RegionPresent: false,
    mediaS3BucketPresent: false,
    mediaS3AccessKeyIdPresent: false,
    mediaS3SecretAccessKeyPresent: false,
    rateLimitStore: 'postgres',
    cspMode: 'report-only',
    webhookRetrySecretPresent: true,
    jobRunnerSecretPresent: false,
    abandonedCheckoutSecretPresent: false,
  }
}

describe('buildDeploymentValidationReport', () => {
  it('returns deploymentReady true when all required production env is present', () => {
    const report = buildDeploymentValidationReport(baseFacts())

    expect(report.deploymentReady).toBe(true)
    expect(report.blockerCount).toBe(0)
    expect(report.readyCount).toBeGreaterThan(0)
  })

  it('marks encryption key as needs_setup when missing in production', () => {
    const facts = baseFacts()
    facts.encryptionKeyPresent = false
    facts.isProduction = true

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'encryption-key')
    expect(check?.status).toBe('needs_setup')
    expect(check?.optional).toBe(false)
    expect(report.blockerCount).toBeGreaterThan(0)
    expect(report.deploymentReady).toBe(false)
  })

  it('marks encryption key as needs_setup when missing in development', () => {
    const facts = baseFacts()
    facts.encryptionKeyPresent = false
    facts.isProduction = false

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'encryption-key')
    expect(check?.status).toBe('needs_setup')
    expect(check?.optional).toBe(false)
    expect(report.deploymentReady).toBe(false)
  })

  it('marks object storage as ready when S3 mode and all vars present', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = 's3'
    facts.mediaS3RegionPresent = true
    facts.mediaS3BucketPresent = true
    facts.mediaS3AccessKeyIdPresent = true
    facts.mediaS3SecretAccessKeyPresent = true

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'object-storage')
    expect(check?.status).toBe('ready')
  })

  it('marks object storage as needs_setup when S3 mode but missing vars', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = 's3'
    facts.mediaS3RegionPresent = false
    facts.mediaS3BucketPresent = false
    facts.mediaS3AccessKeyIdPresent = false
    facts.mediaS3SecretAccessKeyPresent = false

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'object-storage')
    expect(check?.status).toBe('needs_setup')
    expect(check?.optional).toBe(false)
    expect(report.blockerCount).toBeGreaterThan(0)
  })

  it('marks object storage as optional when using postgres fallback in production', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = 'postgres'
    facts.isProduction = true

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'object-storage')
    expect(check?.status).toBe('optional')
    expect(check?.optional).toBe(true)
    expect(report.deploymentReady).toBe(true)
  })

  it('marks object storage as optional when using postgres fallback in development', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = null
    facts.isProduction = false

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'object-storage')
    expect(check?.status).toBe('optional')
  })

  it('marks object storage as ready when Vercel Blob mode has token configured', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = 'vercel-blob'
    facts.mediaBlobTokenPresent = true

    const report = buildDeploymentValidationReport(facts)
    const check = report.checks.find((c) => c.id === 'object-storage')

    expect(check?.status).toBe('ready')
  })

  it('marks object storage as needs_setup when Vercel Blob mode is missing token', () => {
    const facts = baseFacts()
    facts.mediaStorageProvider = 'vercel-blob'
    facts.mediaBlobTokenPresent = false

    const report = buildDeploymentValidationReport(facts)
    const check = report.checks.find((c) => c.id === 'object-storage')

    expect(check?.status).toBe('needs_setup')
    expect(check?.optional).toBe(false)
  })

  it('marks rate limit store as needs_setup when memory is set in production', () => {
    const facts = baseFacts()
    facts.rateLimitStore = 'memory'
    facts.isProduction = true

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'rate-limit-store')
    expect(check?.status).toBe('needs_setup')
  })

  it('marks rate limit store as ready when postgres is explicitly set', () => {
    const facts = baseFacts()
    facts.rateLimitStore = 'postgres'

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'rate-limit-store')
    expect(check?.status).toBe('ready')
  })

  it('marks rate limit store as ready when not set in production (auto-defaults to postgres)', () => {
    const facts = baseFacts()
    facts.rateLimitStore = null
    facts.isProduction = true

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'rate-limit-store')
    expect(check?.status).toBe('ready')
  })

  it('marks job runner auth as ready when WEBHOOK_RETRY_SECRET is set as fallback', () => {
    const facts = baseFacts()
    facts.webhookRetrySecretPresent = true
    facts.jobRunnerSecretPresent = false

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'job-runner-auth')
    expect(check?.status).toBe('ready')
  })

  it('marks job runner auth as needs_setup when no auth secret is present', () => {
    const facts = baseFacts()
    facts.webhookRetrySecretPresent = false
    facts.jobRunnerSecretPresent = false

    const report = buildDeploymentValidationReport(facts)

    const check = report.checks.find((c) => c.id === 'job-runner-auth')
    expect(check?.status).toBe('needs_setup')
    expect(check?.optional).toBe(true)
    // job-runner-auth is optional=true so it does not count as blocker
    expect(report.deploymentReady).toBe(true)
  })

  it('counts checks correctly', () => {
    const report = buildDeploymentValidationReport(baseFacts())

    const total = report.readyCount + report.needsSetupCount + report.optionalCount + report.skippedCount
    expect(total).toBe(report.checks.length)
  })
})

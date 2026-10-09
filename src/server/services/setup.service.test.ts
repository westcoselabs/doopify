import { describe, expect, it } from 'vitest'
import { buildSetupDoctorReport, type SetupDoctorFacts } from './setup.service'
function facts(): SetupDoctorFacts {
  return {
    nodeVersion: 'v22.18.0', npmAvailable: true, dependenciesInstalled: true, missingDependencies: [],
    hasEnvFile: true, hasEnvLocalFile: true, databaseReachable: true, prismaClientGenerated: true,
    storeCount: 1, ownerCount: 1, userRoleAdminSupported: true, storeConfigured: true, storeContactConfigured: true,
    environment: { DATABASE_URL: 'postgresql://private:password@localhost/db', JWT_SECRET: 'jwt-at-least-sixteen-characters',
      NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'D9g_7eQx3mF5aP1vK8rT2yW6cN4hJ0sL9bU5zX1qR7M',
      STRIPE_SECRET_KEY: 'sk_test_private', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public', STRIPE_WEBHOOK_SECRET: 'whsec_private',
      WEBHOOK_RETRY_SECRET: 'retry-key-more-than-sixteen', EMAIL_PROVIDER: 'none', NEXT_PUBLIC_STORE_URL: 'https://shop.example.com' },
  }
}
describe('shared CLI doctor report', () => {
  it('uses the runtime environment contract and never claims live provider verification', () => {
    const report = buildSetupDoctorReport(facts())
    expect(report.ok).toBe(true)
    expect(report.checks.find((check) => check.id === 'integration-stripe')?.summary).toContain('No live provider check')
    expect(JSON.stringify(report)).not.toContain('sk_test_private')
    expect(JSON.stringify(report)).not.toContain('postgresql:')
  })
  it('reports disabled email as a warning and never infers preview from missing credentials', () => {
    const report = buildSetupDoctorReport(facts())
    expect(report.checks.find((check) => check.id === 'email-disabled')).toMatchObject({ status: 'WARN', summary: 'Transactional email is disabled.' })
  })
  it('rejects explicit production preview and malformed environment values', () => {
    const input = facts(); input.environment.EMAIL_PROVIDER = 'preview'
    const report = buildSetupDoctorReport(input)
    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'environment')?.summary).toContain('EMAIL_PROVIDER')
    input.environment.SMTP_PORT = 'invalid-private'
    expect(JSON.stringify(buildSetupDoctorReport(input))).not.toContain('invalid-private')
  })
  it('requires credentials for the selected SMTP provider', () => {
    const input = facts(); input.environment.EMAIL_PROVIDER = 'smtp'
    expect(buildSetupDoctorReport(input).checks.find((check) => check.id === 'integration-smtp')?.status).toBe('FAIL')
  })
  it('retains public URL placeholder and production localhost guards', () => {
    for (const url of ['https://your-doopify-beta-domain.vercel.app', 'http://localhost:3000']) {
      const input = facts(); input.environment.NEXT_PUBLIC_STORE_URL = url
      expect(buildSetupDoctorReport(input).checks.find((check) => check.id === 'next-public-store-url')?.status).toBe('FAIL')
    }
  })
  it('requires Node 22.18 and database ADMIN enum support', () => {
    const input = facts(); input.nodeVersion = 'v22.12.0'; input.userRoleAdminSupported = false
    const report = buildSetupDoctorReport(input)
    expect(report.checks.find((check) => check.id === 'node-version')?.status).toBe('FAIL')
    expect(report.checks.find((check) => check.id === 'user-role-admin-enum')?.status).toBe('FAIL')
  })
})

// @ts-ignore Shared with the local CLI using native Node TypeScript.
import { inspectEnvironment } from '../../lib/env-schema.ts'
// @ts-ignore Shared with the local CLI using native Node TypeScript.
import { evaluatePublicStoreUrl } from '../../lib/public-store-url.ts'

export type SetupCheckStatus = 'PASS' | 'WARN' | 'FAIL'
export type SetupCheck = { id: string; title: string; status: SetupCheckStatus; required: boolean; summary: string; fix?: string }
export type SetupDoctorFacts = {
  nodeVersion: string
  npmAvailable: boolean
  npmVersion?: string
  dependenciesInstalled: boolean
  missingDependencies: string[]
  hasEnvFile: boolean
  hasEnvLocalFile: boolean
  databaseReachable: boolean
  prismaClientGenerated: boolean
  storeCount: number | null
  ownerCount: number | null
  userRoleAdminSupported: boolean
  storeConfigured: boolean | null
  storeContactConfigured: boolean | null
  environment: Record<string, unknown>
}
export type SetupDoctorReport = { checks: SetupCheck[]; passCount: number; warnCount: number; failCount: number; requiredFailCount: number; ok: boolean }

/** Operational checks add database facts to the same config/status contract used by the app. */
export function buildSetupDoctorReport(facts: SetupDoctorFacts): SetupDoctorReport {
  const { config, issues, integrations } = inspectEnvironment(facts.environment)
  const checks: SetupCheck[] = []
  const add = (id: string, title: string, required: boolean, status: SetupCheckStatus, summary: string, fix?: string) => checks.push({ id, title, required, status, summary, fix })
  const version = /^v?(\d+)\.(\d+)/.exec(facts.nodeVersion)
  const nodeReady = Boolean(version && (Number(version[1]) > 22 || (Number(version[1]) === 22 && Number(version[2]) >= 18)))
  add('node-version', 'Node version', true, nodeReady ? 'PASS' : 'FAIL', nodeReady ? 'Node supports native TypeScript execution.' : 'Node 22.18 or newer is required.', 'Install Node 22.18 or newer.')
  add('npm-available', 'npm available', true, facts.npmAvailable ? 'PASS' : 'FAIL', facts.npmAvailable ? 'npm is available.' : 'npm is unavailable.', 'Install npm and ensure it is available on PATH.')
  add('package-install-state', 'Dependencies installed', true, facts.dependenciesInstalled ? 'PASS' : 'FAIL', facts.dependenciesInstalled ? 'Dependencies are installed.' : `Missing dependencies: ${facts.missingDependencies.join(', ')}`, 'Run npm install.')
  add('env-files', 'Environment files', false, facts.hasEnvFile || facts.hasEnvLocalFile ? 'PASS' : 'WARN', facts.hasEnvFile || facts.hasEnvLocalFile ? 'Local environment files exist.' : 'No local environment files; shell or deployment variables may supply configuration.')
  add('environment', 'Typed environment configuration', true, issues.length ? 'FAIL' : 'PASS', issues.length ? `Missing or invalid environment variables: ${issues.join(', ')}` : 'Environment validation passed.', issues.length ? `Correct ${issues.join(', ')} in the deployment environment.` : undefined)
  add('database-reachable', 'Database reachable', true, facts.databaseReachable ? 'PASS' : config.DATABASE_URL ? 'FAIL' : 'WARN', facts.databaseReachable ? 'Database connection succeeded.' : 'Database connection could not be verified.', 'Check DATABASE_URL and database connectivity.')
  add('prisma-client-generated', 'Prisma client generated', true, facts.prismaClientGenerated ? 'PASS' : 'FAIL', facts.prismaClientGenerated ? 'Prisma client artifacts exist.' : 'Prisma client artifacts are missing.', 'Run npm run db:generate.')
  for (const [id, title, count] of [['store-exists', 'Store seeded', facts.storeCount], ['owner-user-exists', 'Owner account exists', facts.ownerCount]] as const) {
    add(id, title, true, !facts.databaseReachable ? 'WARN' : count && count > 0 ? 'PASS' : 'FAIL', !facts.databaseReachable ? 'Skipped until database connectivity succeeds.' : count && count > 0 ? `${count} record(s) found.` : 'Required record is missing.', 'Run the first-owner/bootstrap setup flow.')
  }
  add('user-role-admin-enum', 'Database ADMIN role support', true, !facts.databaseReachable ? 'WARN' : facts.userRoleAdminSupported ? 'PASS' : 'FAIL', facts.userRoleAdminSupported ? 'UserRole supports ADMIN.' : 'ADMIN role support could not be verified.', 'Review migration history and run npm run db:deploy:safe.')
  add('store-settings', 'Store business settings', false, !facts.databaseReachable ? 'WARN' : facts.storeConfigured && facts.storeContactConfigured ? 'PASS' : 'WARN', facts.storeConfigured && facts.storeContactConfigured ? 'Store name and contact email are configured.' : 'Store name or contact email is incomplete.', 'Update General settings in the operational admin.')
  for (const status of integrations) {
    const selectedEmail = status.id === config.EMAIL_PROVIDER
    const selectedShipping = status.id === config.SHIPPING_RATE_PROVIDER || status.id === config.SHIPPING_LABEL_PROVIDER
    const required = status.id === 'stripe' || status.id === 'jobs' || status.id === 'storage' || selectedEmail || selectedShipping
    if (!required) continue
    add(`integration-${status.id}`, `${status.id} environment configuration`, true, status.configured ? 'PASS' : 'FAIL', status.configured ? 'Configured. No live provider check was performed.' : `Missing: ${status.missing.join(', ')}`, status.configured ? undefined : `Set ${status.missing.join(', ')}.`)
    if (status.id === 'stripe' || (status.id === 'resend' && selectedEmail)) {
      const variable = status.id === 'stripe' ? 'STRIPE_WEBHOOK_SECRET' : 'RESEND_WEBHOOK_SECRET'
      add(`${status.id}-webhook`, `${status.id} webhook signing`, true, status.webhookReady ? 'PASS' : 'FAIL', status.webhookReady ? 'Webhook signing secret is configured.' : `${variable} is missing.`, `Set ${variable} before enabling provider webhooks.`)
    }
  }
  if (config.EMAIL_PROVIDER === 'none' || config.EMAIL_PROVIDER === 'preview') {
    add('email-disabled', 'Transactional email', false, 'WARN', config.EMAIL_PROVIDER === 'preview' ? 'Explicit email preview is enabled; messages will not be sent.' : 'Transactional email is disabled.', 'Set EMAIL_PROVIDER=resend or smtp and configure its credentials to send email.')
  }
  const publicUrl = evaluatePublicStoreUrl({ value: config.NEXT_PUBLIC_STORE_URL, nodeEnv: config.NODE_ENV })
  add('next-public-store-url', 'Public storefront URL', true, publicUrl.ready ? 'PASS' : 'FAIL', publicUrl.message, publicUrl.ready ? undefined : 'Set NEXT_PUBLIC_STORE_URL to the public storefront URL.')
  const passCount = checks.filter((check) => check.status === 'PASS').length
  const warnCount = checks.filter((check) => check.status === 'WARN').length
  const failCount = checks.filter((check) => check.status === 'FAIL').length
  const requiredFailCount = checks.filter((check) => check.required && check.status === 'FAIL').length
  return { checks, passCount, warnCount, failCount, requiredFailCount, ok: requiredFailCount === 0 }
}

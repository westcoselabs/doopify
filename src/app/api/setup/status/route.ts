import fs from 'node:fs'
import path from 'node:path'

import { ok, err } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/server/auth/require-auth'
import {
  buildSetupDoctorReport,
  deriveSafeNextActions,
  type SetupCheck,
  type SetupCheckCategory,
  type SetupDoctorFacts,
} from '@/server/services/setup.service'
import { hasRealCredential } from '@/server/services/credential-readiness'

export const runtime = 'nodejs'

type SetupCategorySummary = {
  id: SetupCheckCategory
  label: string
  status: 'PASS' | 'WARN' | 'FAIL'
  requiredFailures: number
  warningCount: number
  checkCount: number
}

const CATEGORY_LABELS: Record<SetupCheckCategory, string> = {
  runtime: 'Runtime',
  database: 'Database',
  admin_owner: 'Admin owner',
  store_settings: 'Store settings',
  stripe: 'Stripe',
  resend_email: 'Resend/email',
  webhook_retry: 'Webhook retry secret',
  public_url: 'Public URL',
  deployment: 'Vercel/deployment',
}

function parseNodeMajor(version: string) {
  const match = /^v(\d+)/.exec(version)
  return match ? Number(match[1]) : null
}

function sanitizeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/:\/\/([^:\s]+):([^@\s]+)@/g, '://$1:***@')
    .replace(/\s+/g, ' ')
    .trim()
}

async function gatherDatabaseFacts(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return {
      databaseReachable: false,
      databaseError: 'DATABASE_URL is missing.',
      storeCount: null as number | null,
      ownerCount: null as number | null,
      storeConfigured: null as boolean | null,
      storeContactConfigured: null as boolean | null,
    }
  }

  try {
    await prisma.$queryRawUnsafe('SELECT 1')

    const [storeCount, ownerCount, firstStore] = await Promise.all([
      prisma.store.count(),
      prisma.user.count({ where: { role: 'OWNER', isActive: true } }),
      prisma.store.findFirst({
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    return {
      databaseReachable: true,
      storeCount,
      ownerCount,
      storeConfigured: Boolean(firstStore?.name?.trim()),
      storeContactConfigured: Boolean(firstStore?.email?.trim()),
    }
  } catch (error) {
    return {
      databaseReachable: false,
      databaseError: sanitizeErrorMessage(error),
      storeCount: null,
      ownerCount: null,
      storeConfigured: null,
      storeContactConfigured: null,
    }
  }
}

function computeCompletionPercent(checks: SetupCheck[]) {
  if (checks.length === 0) return 0

  const score = checks.reduce((acc, check) => {
    if (check.status === 'PASS') return acc + 1
    if (check.status === 'WARN') return acc + 0.5
    return acc
  }, 0)

  return Math.round((score / checks.length) * 100)
}

function buildCategorySummaries(checks: SetupCheck[]): SetupCategorySummary[] {
  const grouped = new Map<SetupCheckCategory, SetupCheck[]>()

  for (const check of checks) {
    const bucket = grouped.get(check.category) ?? []
    bucket.push(check)
    grouped.set(check.category, bucket)
  }

  return Object.keys(CATEGORY_LABELS).map((categoryKey) => {
    const category = categoryKey as SetupCheckCategory
    const categoryChecks = grouped.get(category) ?? []
    const requiredFailures = categoryChecks.filter((check) => check.required && check.status === 'FAIL').length
    const warningCount = categoryChecks.filter((check) => check.status === 'WARN' || (!check.required && check.status === 'FAIL')).length

    const status: 'PASS' | 'WARN' | 'FAIL' =
      requiredFailures > 0
        ? 'FAIL'
        : warningCount > 0
          ? 'WARN'
          : 'PASS'

    return {
      id: category,
      label: CATEGORY_LABELS[category],
      status,
      requiredFailures,
      warningCount,
      checkCount: categoryChecks.length,
    }
  })
}

function checkNeedsAction(check: SetupCheck | undefined) {
  if (!check) return false
  return check.status === 'FAIL' || check.status === 'WARN'
}

function dedupe(items: string[]) {
  return [...new Set(items)]
}

function buildGroupedNextActions(checks: SetupCheck[], facts: SetupDoctorFacts) {
  const byId = new Map(checks.map((check) => [check.id, check]))
  const requiredNextSteps: string[] = []
  const providerSetupSteps: string[] = []
  const optionalProductionSteps: string[] = []

  const pushFix = (bucket: string[], checkId: string) => {
    const check = byId.get(checkId)
    if (!checkNeedsAction(check)) return
    if (check?.fix) bucket.push(check.fix)
  }

  pushFix(requiredNextSteps, 'database-url')
  pushFix(requiredNextSteps, 'database-reachable')
  pushFix(requiredNextSteps, 'prisma-client-generated')
  pushFix(requiredNextSteps, 'owner-user-exists')
  pushFix(requiredNextSteps, 'jwt-secret')
  pushFix(requiredNextSteps, 'webhook-retry-secret')
  pushFix(requiredNextSteps, 'next-public-store-url')

  if (checkNeedsAction(byId.get('store-exists'))) {
    requiredNextSteps.push('Run npm run db:seed:bootstrap to create the initial store and owner records.')
  }

  pushFix(providerSetupSteps, 'stripe-keys')
  pushFix(providerSetupSteps, 'stripe-webhook-secret')
  pushFix(providerSetupSteps, 'resend-api-or-preview')
  pushFix(providerSetupSteps, 'resend-webhook-secret-enabled')

  if (facts.resendApiKeyPresent && !facts.resendWebhookSecretPresent) {
    providerSetupSteps.push(
      'Add RESEND_WEBHOOK_SECRET. Live email sending may work, but bounce/complaint webhook verification is not configured.'
    )
  }

  pushFix(optionalProductionSteps, 'store-settings')
  pushFix(optionalProductionSteps, 'vercel-deployment')

  if (!facts.resendApiKeyPresent) {
    optionalProductionSteps.push('Set RESEND_API_KEY before enabling live transactional email sending in production.')
  }

  return {
    requiredNextSteps: dedupe(requiredNextSteps),
    providerSetupSteps: dedupe(providerSetupSteps),
    optionalProductionSteps: dedupe(optionalProductionSteps),
  }
}

export async function GET(req: Request) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const cwd = process.cwd()
    const databaseUrl = process.env.DATABASE_URL
    const databaseFacts = await gatherDatabaseFacts(databaseUrl)

    const facts: SetupDoctorFacts = {
      nodeVersion: process.version,
      nodeMajorVersion: parseNodeMajor(process.version),
      minimumNodeMajor: 20,
      npmAvailable: true,
      npmVersion: undefined,
      dependenciesInstalled: true,
      missingDependencies: [],
      hasEnvFile: fs.existsSync(path.join(cwd, '.env')),
      hasEnvLocalFile: fs.existsSync(path.join(cwd, '.env.local')),
      databaseUrlPresent: Boolean(databaseUrl),
      databaseReachable: databaseFacts.databaseReachable,
      databaseError: databaseFacts.databaseError,
      prismaClientGenerated:
        fs.existsSync(path.join(cwd, 'node_modules/.prisma/client/index.js')) &&
        fs.existsSync(path.join(cwd, 'node_modules/@prisma/client/index.js')),
      storeCount: databaseFacts.storeCount,
      ownerCount: databaseFacts.ownerCount,
      storeConfigured: databaseFacts.storeConfigured,
      storeContactConfigured: databaseFacts.storeContactConfigured,
      jwtSecret: process.env.JWT_SECRET,
      stripeSecretKeyPresent: hasRealCredential(process.env.STRIPE_SECRET_KEY),
      stripePublishableKeyPresent: hasRealCredential(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      stripeWebhookSecretPresent: hasRealCredential(process.env.STRIPE_WEBHOOK_SECRET),
      webhookRetrySecret: process.env.WEBHOOK_RETRY_SECRET,
      resendApiKeyPresent: hasRealCredential(process.env.RESEND_API_KEY),
      resendWebhookSecretPresent: hasRealCredential(process.env.RESEND_WEBHOOK_SECRET),
      emailProviderWebhooksEnabled: hasRealCredential(process.env.RESEND_API_KEY) || hasRealCredential(process.env.RESEND_WEBHOOK_SECRET),
      nextPublicStoreUrl: process.env.NEXT_PUBLIC_STORE_URL,
      vercelEnvironmentDetected: Boolean(process.env.VERCEL || process.env.VERCEL_ENV),
      vercelUrlPresent: Boolean(process.env.VERCEL_URL),
    }

    const report = buildSetupDoctorReport(facts, { profile: 'app' })
    const requiredChecks = report.checks.filter((check) => check.required)
    const recommendedChecks = report.checks.filter((check) => !check.required)

    const warnings = report.checks
      .filter((check) => check.status === 'WARN' || (!check.required && check.status === 'FAIL'))
      .map((check) => ({
        id: check.id,
        category: check.category,
        title: check.title,
        summary: check.summary,
      }))

    const categories = buildCategorySummaries(report.checks)
    const completionPercent = computeCompletionPercent(report.checks)
    const safeNextActions = deriveSafeNextActions(report.checks)
    const groupedNextActions = buildGroupedNextActions(report.checks, facts)

    const overallStatus = report.requiredFailCount > 0
      ? 'ACTION_REQUIRED'
      : warnings.length > 0
        ? 'READY_WITH_WARNINGS'
        : 'HEALTHY'

    return ok({
      checks: report.checks,
      passCount: report.passCount,
      warnCount: report.warnCount,
      failCount: report.failCount,
      requiredFailCount: report.requiredFailCount,
      ok: report.ok,
      overallStatus,
      completionPercent,
      checkedAt: new Date().toISOString(),
      categories,
      requiredChecks,
      recommendedChecks,
      warnings,
      safeNextActions,
      nextActions: safeNextActions,
      requiredNextSteps: groupedNextActions.requiredNextSteps,
      providerSetupSteps: groupedNextActions.providerSetupSteps,
      optionalProductionSteps: groupedNextActions.optionalProductionSteps,
      summary: {
        passCount: report.passCount,
        warnCount: report.warnCount,
        failCount: report.failCount,
        requiredFailCount: report.requiredFailCount,
      },
    })
  } catch (error) {
    console.error(`[GET /api/setup/status] ${sanitizeErrorMessage(error)}`)
    return err('Failed to collect setup diagnostics', 500)
  }
}

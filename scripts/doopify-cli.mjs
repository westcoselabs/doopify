#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import readline from 'node:readline/promises'

import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const envPath = path.join(repoRoot, '.env')
const envLocalPath = path.join(repoRoot, '.env.local')

const SETUP_FIELDS = [
  {
    id: 'storeName',
    envKey: 'DOOPIFY_STORE_NAME',
    label: 'Store name',
    required: true,
    secret: false,
  },
  {
    id: 'storeEmail',
    envKey: 'DOOPIFY_STORE_EMAIL',
    label: 'Store email',
    required: true,
    secret: false,
    validate: validateEmail,
  },
  {
    id: 'ownerEmail',
    envKey: 'DOOPIFY_ADMIN_EMAIL',
    label: 'Owner email',
    required: true,
    secret: false,
    validate: validateEmail,
  },
  {
    id: 'ownerPassword',
    envKey: 'DOOPIFY_ADMIN_PASSWORD',
    label: 'Owner password',
    required: true,
    secret: true,
    minLength: 8,
  },
  {
    id: 'publicAppUrl',
    envKey: 'NEXT_PUBLIC_STORE_URL',
    label: 'Public app URL',
    required: true,
    secret: false,
    validate: validateHttpUrl,
  },
  {
    id: 'databaseUrl',
    envKey: 'DATABASE_URL',
    label: 'Database URL / Neon connection',
    required: true,
    secret: true,
  },
  {
    id: 'stripeSecretKey',
    envKey: 'STRIPE_SECRET_KEY',
    label: 'Stripe secret key',
    required: true,
    secret: true,
  },
  {
    id: 'stripePublishableKey',
    envKey: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    label: 'Stripe publishable key',
    required: true,
    secret: true,
  },
  {
    id: 'stripeWebhookSecret',
    envKey: 'STRIPE_WEBHOOK_SECRET',
    label: 'Stripe webhook secret',
    required: true,
    secret: true,
  },
  {
    id: 'resendApiKey',
    envKey: 'RESEND_API_KEY',
    label: 'Resend API key (optional: leave blank for preview mode)',
    required: false,
    secret: true,
  },
  {
    id: 'resendWebhookSecret',
    envKey: 'RESEND_WEBHOOK_SECRET',
    label: 'Resend webhook secret (optional unless API key is set)',
    required: false,
    secret: true,
  },
  {
    id: 'webhookRetrySecret',
    envKey: 'WEBHOOK_RETRY_SECRET',
    label: 'Webhook retry secret (leave blank to auto-generate)',
    required: false,
    secret: true,
  },
]

const REDACTED = '[REDACTED]'
const SECRET_KEY_PATTERN = /(PASSWORD|SECRET|KEY|TOKEN|DATABASE_URL|DIRECT_URL)/i
const STRIPE_WEBHOOK_EVENTS = ['payment_intent.succeeded', 'payment_intent.payment_failed']
const RESEND_WEBHOOK_EVENTS = ['email.bounced', 'email.complained']
const VERCEL_ENV_TARGETS = ['development', 'preview', 'production']
const VERCEL_ENV_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STORE_URL',
  'WEBHOOK_RETRY_SECRET',
]

function loadEnvFiles(rootDir) {
  dotenv.config({ path: path.join(rootDir, '.env'), quiet: true })
  dotenv.config({ path: path.join(rootDir, '.env.local'), override: true, quiet: true })
}

function parseNodeMajor(version) {
  const match = /^v(\d+)/.exec(version)
  return match ? Number(match[1]) : null
}

function normalizeEmail(value) {
  return value.trim().toLowerCase()
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function validateHttpUrl(value) {
  try {
    const parsed = new URL(value.trim())
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

function sanitizeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/:\/\/([^:\s]+):([^@\s]+)@/g, '://$1:***@')
    .replace(/\s+/g, ' ')
    .trim()
}

async function loadSetupService() {
  const servicePath = path.join(repoRoot, 'src', 'server', 'services', 'setup.service.ts')

  try {
    return await import(servicePath)
  } catch {
    // Fall through to transpile fallback for older Node runtimes.
  }

  try {
    const tsModule = await import('typescript')
    const source = fs.readFileSync(servicePath, 'utf8')
    const transpiled = tsModule.transpileModule(source, {
      compilerOptions: {
        module: tsModule.ModuleKind.ESNext,
        target: tsModule.ScriptTarget.ES2020,
      },
      fileName: servicePath,
    })

    const encoded = Buffer.from(transpiled.outputText, 'utf8').toString('base64')
    return import(`data:text/javascript;base64,${encoded}`)
  } catch {
    return null
  }
}

function normalizeDatabaseUrl(connectionString) {
  try {
    const url = new URL(connectionString)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode && ['prefer', 'require', 'verify-ca'].includes(sslmode)) {
      url.searchParams.set('sslmode', 'verify-full')
      return url.toString()
    }
  } catch {
    return connectionString
  }
  return connectionString
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    return dotenv.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function parseEnvKeyOrder(filePath) {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const keys = []
  const seen = new Set()
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!match) continue
    const key = match[1]
    if (seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }

  return keys
}

function serializeEnvValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function readCombinedEnv() {
  const env = parseEnvFile(envPath)
  const envLocal = parseEnvFile(envLocalPath)
  return { ...env, ...envLocal }
}

function redactForOutput(key, value) {
  if (!value) return '(empty)'
  if (!SECRET_KEY_PATTERN.test(key)) return value
  return REDACTED
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function generateSecret(bytes = 48) {
  return randomBytes(bytes).toString('base64url')
}

function getNpmCommandParts() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      baseArgs: [process.env.npm_execpath],
    }
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    baseArgs: [],
  }
}

function runCommand(command, args, label) {
  console.log(`\n> ${label}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw new Error(`Command failed (${label}): ${sanitizeErrorMessage(result.error)}`)
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${label}) with exit code ${result.status}.`)
  }
}

function runNpmCommand(args, label) {
  const npm = getNpmCommandParts()
  runCommand(npm.command, [...npm.baseArgs, ...args], label)
}

function runCommandWithInput(command, args, label, input) {
  console.log(`\n> ${label}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  })

  if (result.error) {
    throw new Error(`Command failed (${label}): ${sanitizeErrorMessage(result.error)}`)
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${label}) with exit code ${result.status}.`)
  }
}

function getNpxCommandParts() {
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    baseArgs: ['--yes', 'vercel@latest'],
  }
}

function runVercelCli(args, label, options = {}) {
  const npx = getNpxCommandParts()
  if (options.input != null) {
    runCommandWithInput(npx.command, [...npx.baseArgs, ...args], label, options.input)
    return
  }
  runCommand(npx.command, [...npx.baseArgs, ...args], label)
}

function buildScopeArg(scope) {
  return hasValue(scope) ? ['--scope', scope.trim()] : []
}

function requireValue(value, message) {
  if (!hasValue(value)) {
    throw new Error(message)
  }
  return value.trim()
}

function buildSetupDoctorReportFallback(facts) {
  const checks = []
  const add = (id, title, required, status, summary, fix) => checks.push({ id, title, required, status, summary, fix })
  const pass = (value) => (value ? 'PASS' : 'FAIL')
  const isWeak = (value) => /(change[-_]?me|example|default|test|password|secret|doopify)/i.test(value || '')

  add('node-version', 'Node version', true, facts.nodeMajorVersion >= facts.minimumNodeMajor ? 'PASS' : 'FAIL', facts.nodeMajorVersion >= facts.minimumNodeMajor ? `Node ${facts.nodeVersion} satisfies minimum v${facts.minimumNodeMajor}.` : `Node ${facts.nodeVersion} is below minimum v${facts.minimumNodeMajor}.`, `Upgrade Node.js to v${facts.minimumNodeMajor} or newer.`)
  add('npm-available', 'npm available', true, pass(facts.npmAvailable), facts.npmAvailable ? `npm is available${facts.npmVersion ? ` (${facts.npmVersion})` : ''}.` : 'npm command is not available.', 'Install npm and ensure it is available on PATH.')
  add('package-install-state', 'Package install state', true, pass(facts.dependenciesInstalled), facts.dependenciesInstalled ? 'Dependencies appear installed.' : `Missing dependencies: ${facts.missingDependencies.join(', ')}`, 'Run npm install, then re-run npm run doopify:doctor.')
  add('env-files', '.env / .env.local presence', false, facts.hasEnvFile || facts.hasEnvLocalFile ? 'PASS' : 'WARN', facts.hasEnvFile || facts.hasEnvLocalFile ? 'Env files detected.' : 'No .env or .env.local file found in the repo root.', 'Create .env.local with required environment values (or provide them via shell/CI environment).')
  add('database-url', 'DATABASE_URL present', true, pass(facts.databaseUrlPresent), facts.databaseUrlPresent ? 'DATABASE_URL is set.' : 'DATABASE_URL is missing.', 'Set DATABASE_URL in .env.local or your runtime environment.')
  add('database-reachable', 'Database reachable', true, facts.databaseUrlPresent ? pass(facts.databaseReachable) : 'WARN', !facts.databaseUrlPresent ? 'Skipped because DATABASE_URL is missing.' : facts.databaseReachable ? 'Database connection succeeded.' : 'Database connection failed.', facts.databaseReachable ? undefined : 'Verify database server accessibility and credentials.')
  add('prisma-client-generated', 'Prisma client generated', true, pass(facts.prismaClientGenerated), facts.prismaClientGenerated ? 'Prisma client artifacts were found.' : 'Prisma client artifacts were not found.', 'Run npm run db:generate to generate Prisma client artifacts.')
  add('store-exists', 'Store exists', true, facts.databaseReachable ? (facts.storeCount > 0 ? 'PASS' : 'FAIL') : 'WARN', facts.databaseReachable ? (facts.storeCount > 0 ? `${facts.storeCount} store record(s) found.` : 'No store records found.') : 'Skipped because database check did not complete.', 'Run npm run db:seed:bootstrap or create a store via setup flow.')
  add('owner-user-exists', 'Owner/admin user exists', true, facts.databaseReachable ? (facts.ownerCount > 0 ? 'PASS' : 'FAIL') : 'WARN', facts.databaseReachable ? (facts.ownerCount > 0 ? `${facts.ownerCount} OWNER user(s) found.` : 'No OWNER user found.') : 'Skipped because database check did not complete.', 'Run npm run db:seed:bootstrap or create an OWNER user through setup tooling.')
  add('user-role-admin-enum', 'UserRole enum includes ADMIN', true, facts.databaseReachable ? (facts.userRoleAdminSupported ? 'PASS' : 'FAIL') : 'WARN', facts.databaseReachable ? (facts.userRoleAdminSupported ? 'UserRole enum contains ADMIN.' : 'UserRole enum is missing ADMIN.') : 'Skipped because database check did not complete.', 'Apply latest schema changes to this database (`npm run db:push` or prisma migrate deploy) so UserRole includes ADMIN.')

  const jwtStrong = Boolean(facts.jwtSecret) && facts.jwtSecret.length >= 32
  add('jwt-secret', 'JWT_SECRET strength', true, jwtStrong ? (isWeak(facts.jwtSecret) ? 'WARN' : 'PASS') : 'FAIL', !facts.jwtSecret ? 'JWT_SECRET is missing.' : jwtStrong ? 'JWT_SECRET is present and strong enough.' : `JWT_SECRET is too short (${facts.jwtSecret.length} characters).`, 'Set JWT_SECRET in .env.local to a random secret with at least 32 characters.')
  add('stripe-keys', 'Stripe keys present', true, facts.stripeSecretKeyPresent && facts.stripePublishableKeyPresent ? 'PASS' : 'FAIL', facts.stripeSecretKeyPresent && facts.stripePublishableKeyPresent ? 'Stripe secret and publishable keys are present.' : 'Missing Stripe secret key and/or publishable key.', 'Set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.')
  add('stripe-webhook-secret', 'Stripe webhook secret present', true, pass(facts.stripeWebhookSecretPresent), facts.stripeWebhookSecretPresent ? 'STRIPE_WEBHOOK_SECRET is present.' : 'STRIPE_WEBHOOK_SECRET is missing.', 'Set STRIPE_WEBHOOK_SECRET for /api/webhooks/stripe.')

  const retryStrong = Boolean(facts.webhookRetrySecret) && facts.webhookRetrySecret.length >= 16
  add('webhook-retry-secret', 'WEBHOOK_RETRY_SECRET present', true, retryStrong ? (isWeak(facts.webhookRetrySecret) ? 'WARN' : 'PASS') : 'FAIL', !facts.webhookRetrySecret ? 'WEBHOOK_RETRY_SECRET is missing.' : retryStrong ? 'WEBHOOK_RETRY_SECRET is present.' : `WEBHOOK_RETRY_SECRET is too short (${facts.webhookRetrySecret.length} characters).`, 'Set WEBHOOK_RETRY_SECRET in .env.local to a random secret with at least 16 characters.')
  add('resend-api-or-preview', 'RESEND_API_KEY or preview mode', true, 'PASS', facts.resendApiKeyPresent ? 'RESEND_API_KEY is present.' : 'RESEND_API_KEY is not set; preview mode is active.', 'Set RESEND_API_KEY to enable live provider sends (optional in local preview mode).')
  add('resend-webhook-secret-enabled', 'RESEND_WEBHOOK_SECRET for email-provider webhooks', facts.emailProviderWebhooksEnabled, facts.emailProviderWebhooksEnabled ? pass(facts.resendWebhookSecretPresent) : facts.resendWebhookSecretPresent ? 'PASS' : 'WARN', facts.emailProviderWebhooksEnabled ? (facts.resendWebhookSecretPresent ? 'RESEND_WEBHOOK_SECRET is present for email-provider webhook verification.' : 'Email-provider webhooks appear enabled but RESEND_WEBHOOK_SECRET is missing.') : facts.resendWebhookSecretPresent ? 'RESEND_WEBHOOK_SECRET is configured.' : 'Email-provider webhook verification is not enabled; RESEND_WEBHOOK_SECRET is optional right now.', facts.emailProviderWebhooksEnabled ? 'Set RESEND_WEBHOOK_SECRET to verify webhook signatures on /api/webhooks/email-provider.' : 'If you enable provider webhooks, set RESEND_WEBHOOK_SECRET first.')

  let storeUrlStatus = 'FAIL'
  let storeUrlSummary = 'NEXT_PUBLIC_STORE_URL is missing.'
  if (facts.nextPublicStoreUrl) {
    try {
      const parsed = new URL(facts.nextPublicStoreUrl)
      storeUrlStatus = ['http:', 'https:'].includes(parsed.protocol) ? 'PASS' : 'FAIL'
      storeUrlSummary = storeUrlStatus === 'PASS' ? 'NEXT_PUBLIC_STORE_URL is present and valid.' : 'NEXT_PUBLIC_STORE_URL must use http:// or https://.'
    } catch {
      storeUrlStatus = 'FAIL'
      storeUrlSummary = 'NEXT_PUBLIC_STORE_URL is not a valid URL.'
    }
  }
  add('next-public-store-url', 'NEXT_PUBLIC_STORE_URL present', true, storeUrlStatus, storeUrlSummary, 'Set NEXT_PUBLIC_STORE_URL to your storefront base URL.')

  const passCount = checks.filter((check) => check.status === 'PASS').length
  const warnCount = checks.filter((check) => check.status === 'WARN').length
  const failCount = checks.filter((check) => check.status === 'FAIL').length
  const requiredFailCount = checks.filter((check) => check.required && check.status === 'FAIL').length

  return {
    checks,
    passCount,
    warnCount,
    failCount,
    requiredFailCount,
    ok: requiredFailCount === 0,
  }
}

function checkNpmAvailability() {
  const userAgent = process.env.npm_config_user_agent || ''
  const npmVersionFromUserAgent = /(?:^|\s)npm\/([0-9][0-9A-Za-z.+-]*)/.exec(userAgent)?.[1]
  if (npmVersionFromUserAgent) {
    return {
      available: true,
      version: npmVersionFromUserAgent,
    }
  }

  const npmExecPath = process.env.npm_execpath
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, '--version'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })

  const ok = result.status === 0 && !result.error

  return {
    available: ok,
    version: ok ? result.stdout.trim() : undefined,
  }
}

function checkDependenciesInstalled() {
  const required = [
    { name: 'node_modules', relativePath: 'node_modules' },
    { name: 'next', relativePath: 'node_modules/next/package.json' },
    { name: '@prisma/client', relativePath: 'node_modules/@prisma/client/package.json' },
    { name: 'prisma', relativePath: 'node_modules/prisma/package.json' },
  ]

  const missing = required
    .filter((entry) => !fs.existsSync(path.join(repoRoot, entry.relativePath)))
    .map((entry) => entry.name)

  return {
    installed: missing.length === 0,
    missing,
  }
}

async function checkDatabaseFacts(databaseUrlPresent, dependenciesInstalled) {
  if (!databaseUrlPresent || !dependenciesInstalled) {
    return {
      databaseReachable: false,
      databaseError: databaseUrlPresent ? 'Install dependencies before running DB checks.' : 'DATABASE_URL is missing.',
      storeCount: null,
      ownerCount: null,
      userRoleAdminSupported: null,
      storeConfigured: null,
      storeContactConfigured: null,
    }
  }

  let prisma
  try {
    const prismaModule = await import('@prisma/client')
    const adapterModule = await import('@prisma/adapter-pg')
    const PrismaClient = prismaModule.PrismaClient
    const PrismaPg = adapterModule.PrismaPg

    const normalizedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || '')

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: normalizedDatabaseUrl }),
    })

    await prisma.$queryRawUnsafe('SELECT 1')

    const [storeCount, ownerCount, firstStore, userRoleAdminRows] = await Promise.all([
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
      prisma.$queryRawUnsafe(`
        SELECT enum.enumlabel
        FROM pg_enum enum
        JOIN pg_type type ON enum.enumtypid = type.oid
        WHERE type.typname = 'UserRole'
          AND enum.enumlabel = 'ADMIN'
      `),
    ])

    const userRoleAdminSupported = Array.isArray(userRoleAdminRows) && userRoleAdminRows.length > 0

    return {
      databaseReachable: true,
      storeCount,
      ownerCount,
      userRoleAdminSupported,
      storeConfigured: Boolean(firstStore?.name?.trim()),
      storeContactConfigured: Boolean(firstStore?.email?.trim()),
    }
  } catch (error) {
    return {
      databaseReachable: false,
      databaseError: sanitizeErrorMessage(error),
      storeCount: null,
      ownerCount: null,
      userRoleAdminSupported: null,
      storeConfigured: null,
      storeContactConfigured: null,
    }
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {})
    }
  }
}

async function createDoctorReport() {
  const setupService = await loadSetupService()
  const reportBuilder = setupService?.buildSetupDoctorReport || buildSetupDoctorReportFallback

  const nodeMajorVersion = parseNodeMajor(process.version)
  const npmCheck = checkNpmAvailability()
  const dependencyCheck = checkDependenciesInstalled()

  const hasEnvFile = fs.existsSync(path.join(repoRoot, '.env'))
  const hasEnvLocalFile = fs.existsSync(path.join(repoRoot, '.env.local'))

  const prismaClientGenerated =
    fs.existsSync(path.join(repoRoot, 'node_modules/.prisma/client/index.js')) &&
    fs.existsSync(path.join(repoRoot, 'node_modules/@prisma/client/index.js'))

  const databaseUrlPresent = Boolean(process.env.DATABASE_URL)
  const databaseFacts = await checkDatabaseFacts(databaseUrlPresent, dependencyCheck.installed)

  const facts = {
    nodeVersion: process.version,
    nodeMajorVersion,
    minimumNodeMajor: 20,
    npmAvailable: npmCheck.available,
    npmVersion: npmCheck.version,
    dependenciesInstalled: dependencyCheck.installed,
    missingDependencies: dependencyCheck.missing,
    hasEnvFile,
    hasEnvLocalFile,
    databaseUrlPresent,
    databaseReachable: databaseFacts.databaseReachable,
    databaseError: databaseFacts.databaseError,
    prismaClientGenerated,
    storeCount: databaseFacts.storeCount,
    ownerCount: databaseFacts.ownerCount,
    userRoleAdminSupported: databaseFacts.userRoleAdminSupported,
    storeConfigured: databaseFacts.storeConfigured,
    storeContactConfigured: databaseFacts.storeContactConfigured,
    jwtSecret: process.env.JWT_SECRET,
    stripeSecretKeyPresent: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePublishableKeyPresent: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    stripeWebhookSecretPresent: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    webhookRetrySecret: process.env.WEBHOOK_RETRY_SECRET,
    resendApiKeyPresent: Boolean(process.env.RESEND_API_KEY),
    resendWebhookSecretPresent: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    emailProviderWebhooksEnabled: Boolean(process.env.RESEND_API_KEY || process.env.RESEND_WEBHOOK_SECRET),
    nextPublicStoreUrl: process.env.NEXT_PUBLIC_STORE_URL,
    vercelEnvironmentDetected: Boolean(process.env.VERCEL || process.env.VERCEL_ENV),
    vercelUrlPresent: Boolean(process.env.VERCEL_URL),
  }

  const report = reportBuilder(facts, { profile: 'cli' })

  return { report, usedFallback: !setupService?.buildSetupDoctorReport }
}

function printDoctorReport(report) {
  for (const check of report.checks) {
    const scope = check.required ? 'required' : 'optional'
    console.log(`${check.status.padEnd(4)} ${check.title} (${scope})`)
    console.log(`  ${check.summary}`)
    if (check.fix && check.status !== 'PASS') {
      console.log(`  Fix: ${check.fix}`)
    }
    console.log('')
  }

  console.log(`Summary: PASS ${report.passCount}  WARN ${report.warnCount}  FAIL ${report.failCount}`)
}

async function runDoctor(options = {}) {
  const { exitOnFailure = true } = options
  loadEnvFiles(repoRoot)

  const { report, usedFallback } = await createDoctorReport()

  if (usedFallback) {
    console.log('WARN setup service model could not be loaded directly; using CLI fallback model.')
    console.log('')
  }

  console.log('Doopify Doctor (read-only)')
  console.log('')

  printDoctorReport(report)

  if (!report.ok) {
    console.error(`Required checks failed: ${report.requiredFailCount}`)
    if (exitOnFailure) {
      process.exitCode = 1
    }
    return report
  }

  if (exitOnFailure) {
    process.exitCode = 0
  }
  return report
}

function createPromptClient() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  const originalWriteToOutput = rl._writeToOutput.bind(rl)
  let muted = false

  rl._writeToOutput = (value) => {
    if (muted) {
      return
    }
    originalWriteToOutput(value)
  }

  return {
    rl,
    close() {
      rl.close()
    },
    async ask(prompt, options = {}) {
      const {
        defaultValue,
        required = true,
        secret = false,
        minLength,
        validate,
      } = options

      while (true) {
        const hint = defaultValue ? ` [default: ${secret ? REDACTED : defaultValue}]` : ''
        const fullPrompt = `${prompt}${hint}: `

        let answer = ''
        if (secret) {
          process.stdout.write(fullPrompt)
          muted = true
          answer = await rl.question('')
          muted = false
          process.stdout.write('\n')
        } else {
          answer = await rl.question(fullPrompt)
        }

        const candidate = answer.trim() || (defaultValue ?? '')

        if (!candidate && required) {
          console.log('Value is required.')
          continue
        }

        if (!candidate) {
          return ''
        }

        if (minLength && candidate.length < minLength) {
          console.log(`Value must be at least ${minLength} characters.`)
          continue
        }

        if (validate && !validate(candidate)) {
          console.log('Value is not in a valid format.')
          continue
        }

        return candidate
      }
    },
    async confirm(prompt, defaultYes = true) {
      const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: '
      while (true) {
        const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase()
        if (!answer) return defaultYes
        if (answer === 'y' || answer === 'yes') return true
        if (answer === 'n' || answer === 'no') return false
        console.log('Please answer yes or no.')
      }
    },
  }
}

function appendQueryParams(url, entries) {
  for (const [key, value] of entries) {
    if (!hasValue(value)) continue
    url.searchParams.set(key, value.trim())
  }
}

function buildDoopifyBaseUrl(storeUrl) {
  const parsed = new URL(storeUrl)
  return parsed.toString().replace(/\/+$/, '')
}

function buildStripeWebhookUrl(storeUrl) {
  return `${buildDoopifyBaseUrl(storeUrl)}/api/webhooks/stripe`
}

function buildResendWebhookUrl(storeUrl) {
  return `${buildDoopifyBaseUrl(storeUrl)}/api/webhooks/email-provider`
}

function ensureHttpsUrlForWebhooks(url, label) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${label} must be a valid URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https:// for live webhook delivery.`)
  }
}

function buildStripeFormBody(values) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        body.append(`${key}[${index}]`, item)
      })
      continue
    }

    if (value == null) continue
    body.append(key, String(value))
  }
  return body
}

async function parseApiResponse(response, label) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 400)}`)
  }

  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function vercelApiRequest(context, method, pathname, body) {
  const base = new URL(`https://api.vercel.com${pathname}`)
  appendQueryParams(base, [
    ['upsert', 'true'],
    ['teamId', context.scope.startsWith('team_') ? context.scope : ''],
    ['slug', context.scope.startsWith('team_') ? '' : context.scope],
  ])

  const response = await fetch(base, {
    method,
    headers: {
      Authorization: `Bearer ${context.token}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  })

  return parseApiResponse(response, `Vercel API ${method} ${pathname}`)
}

async function fetchStripeWebhookEndpoints(stripeSecretKey) {
  const response = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
  })
  const data = await parseApiResponse(response, 'Stripe webhook list')
  return Array.isArray(data?.data) ? data.data : []
}

async function createStripeWebhookEndpoint(stripeSecretKey, webhookUrl) {
  const response = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: buildStripeFormBody({
      url: webhookUrl,
      enabled_events: STRIPE_WEBHOOK_EVENTS,
      description: 'Doopify checkout webhook',
    }),
  })

  return parseApiResponse(response, 'Stripe webhook create')
}

async function updateStripeWebhookEndpoint(stripeSecretKey, endpointId, webhookUrl) {
  const response = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${endpointId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: buildStripeFormBody({
      url: webhookUrl,
      enabled_events: STRIPE_WEBHOOK_EVENTS,
      disabled: false,
      description: 'Doopify checkout webhook',
    }),
  })

  return parseApiResponse(response, 'Stripe webhook update')
}

async function fetchResendWebhooks(resendApiKey) {
  const response = await fetch('https://api.resend.com/webhooks', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'User-Agent': 'doopify-cli/0.1.0',
    },
  })
  const data = await parseApiResponse(response, 'Resend webhook list')
  return Array.isArray(data?.data) ? data.data : []
}

async function createResendWebhook(resendApiKey, webhookUrl) {
  const response = await fetch('https://api.resend.com/webhooks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'doopify-cli/0.1.0',
    },
    body: JSON.stringify({
      endpoint: webhookUrl,
      events: RESEND_WEBHOOK_EVENTS,
    }),
  })
  return parseApiResponse(response, 'Resend webhook create')
}

async function updateResendWebhook(resendApiKey, webhookId, webhookUrl) {
  const response = await fetch(`https://api.resend.com/webhooks/${webhookId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'doopify-cli/0.1.0',
    },
    body: JSON.stringify({
      endpoint: webhookUrl,
      events: RESEND_WEBHOOK_EVENTS,
      status: 'enabled',
    }),
  })
  return parseApiResponse(response, 'Resend webhook update')
}

async function getResendWebhook(resendApiKey, webhookId) {
  const response = await fetch(`https://api.resend.com/webhooks/${webhookId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'User-Agent': 'doopify-cli/0.1.0',
    },
  })
  return parseApiResponse(response, 'Resend webhook get')
}

async function collectSetupInputs(existingEnv) {
  const prompts = createPromptClient()
  const values = {}

  try {
    console.log('Doopify Setup (interactive)')
    console.log('')
    console.log('This command updates .env.local, prepares Prisma, bootstraps store/owner, then runs doctor.')
    console.log('Secrets are never printed in clear text.')
    console.log('')

    for (const field of SETUP_FIELDS) {
      const existingValue = existingEnv[field.envKey]
      if (field.secret && hasValue(existingValue)) {
        const keep = await prompts.confirm(`Keep existing ${field.envKey} (${REDACTED})?`, true)
        if (keep) {
          values[field.id] = existingValue
          continue
        }
      }

      values[field.id] = await prompts.ask(field.label, {
        defaultValue: field.secret ? undefined : existingValue,
        required: field.required,
        secret: field.secret,
        minLength: field.minLength,
        validate: field.validate,
      })
    }

    if (!hasValue(values.resendWebhookSecret) && hasValue(values.resendApiKey)) {
      values.resendWebhookSecret = await prompts.ask(
        'Resend webhook secret is required when RESEND_API_KEY is set',
        { required: true, secret: true }
      )
    }

    if (!hasValue(values.webhookRetrySecret)) {
      values.webhookRetrySecret = generateSecret(24)
      console.log('Generated WEBHOOK_RETRY_SECRET.')
    }

    return values
  } finally {
    prompts.close()
  }
}

async function buildEnvUpdates(existingEnv) {
  const values = await collectSetupInputs(existingEnv)
  const updates = {
    DOOPIFY_STORE_NAME: values.storeName,
    DOOPIFY_STORE_EMAIL: values.storeEmail,
    DOOPIFY_ADMIN_EMAIL: normalizeEmail(values.ownerEmail),
    DOOPIFY_ADMIN_PASSWORD: values.ownerPassword,
    NEXT_PUBLIC_STORE_URL: values.publicAppUrl,
    DATABASE_URL: values.databaseUrl,
    DIRECT_URL: existingEnv.DIRECT_URL || values.databaseUrl,
    STRIPE_SECRET_KEY: values.stripeSecretKey,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: values.stripePublishableKey,
    STRIPE_WEBHOOK_SECRET: values.stripeWebhookSecret,
    RESEND_API_KEY: values.resendApiKey || '',
    RESEND_WEBHOOK_SECRET: values.resendWebhookSecret || '',
    WEBHOOK_RETRY_SECRET: values.webhookRetrySecret,
  }

  if (!hasValue(existingEnv.JWT_SECRET)) {
    updates.JWT_SECRET = generateSecret(48)
    console.log('Generated JWT_SECRET.')
  }

  return { values, updates }
}

async function filterUpdatesWithOverwriteConfirmation(existingEnv, updates) {
  const prompts = createPromptClient()
  const accepted = {}

  try {
    for (const [key, value] of Object.entries(updates)) {
      const existingValue = existingEnv[key]
      if (!hasValue(existingValue) || existingValue === value) {
        accepted[key] = value
        continue
      }

      const overwrite = await prompts.confirm(
        `Overwrite existing ${key} (${redactForOutput(key, existingValue)})?`,
        false
      )

      if (overwrite) {
        accepted[key] = value
      } else {
        accepted[key] = existingValue
      }
    }
  } finally {
    prompts.close()
  }

  return accepted
}

function writeEnvLocal(updates) {
  const existingLocal = parseEnvFile(envLocalPath)
  const order = parseEnvKeyOrder(envLocalPath)
  const merged = { ...existingLocal, ...updates }
  const keys = [...order, ...Object.keys(merged).filter((key) => !order.includes(key))]
  const uniqueKeys = [...new Set(keys)]
  const lines = uniqueKeys.map((key) => `${key}=${serializeEnvValue(merged[key])}`)

  fs.writeFileSync(envLocalPath, `${lines.join('\n')}\n`, 'utf8')
}

async function bootstrapStoreAndOwner(values) {
  let prisma
  try {
    const prismaModule = await import('@prisma/client')
    const adapterModule = await import('@prisma/adapter-pg')
    const PrismaClient = prismaModule.PrismaClient
    const PrismaPg = adapterModule.PrismaPg

    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: normalizeDatabaseUrl(values.databaseUrl),
      }),
    })

    const existingStore = await prisma.store.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true },
    })

    let storeRecord
    if (existingStore) {
      storeRecord = await prisma.store.update({
        where: { id: existingStore.id },
        data: {
          name: values.storeName,
          email: values.storeEmail,
        },
      })
      console.log(`Updated store ${storeRecord.name}.`)
    } else {
      storeRecord = await prisma.store.create({
        data: {
          name: values.storeName,
          email: values.storeEmail,
        },
      })
      console.log(`Created store ${storeRecord.name}.`)
    }

    const ownerEmail = normalizeEmail(values.ownerEmail)
    const passwordHash = await bcrypt.hash(values.ownerPassword, 12)
    const existingOwner = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    })

    if (existingOwner) {
      await prisma.user.update({
        where: { id: existingOwner.id },
        data: {
          passwordHash,
          role: 'OWNER',
          isActive: true,
        },
      })
      console.log(`Updated owner user ${ownerEmail}.`)
    } else {
      await prisma.user.create({
        data: {
          email: ownerEmail,
          passwordHash,
          role: 'OWNER',
          isActive: true,
        },
      })
      console.log(`Created owner user ${ownerEmail}.`)
    }
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {})
    }
  }
}

function printEnvSummary(updates) {
  console.log('\nPlanned .env.local updates:')
  for (const [key, value] of Object.entries(updates)) {
    console.log(`- ${key}=${redactForOutput(key, value)}`)
  }
}

async function runSetup() {
  loadEnvFiles(repoRoot)
  const existingEnv = readCombinedEnv()

  const { values, updates: requestedUpdates } = await buildEnvUpdates(existingEnv)
  const updates = await filterUpdatesWithOverwriteConfirmation(existingEnv, requestedUpdates)
  printEnvSummary(updates)

  writeEnvLocal(updates)
  console.log(`\nWrote ${Object.keys(updates).length} values to .env.local.`)

  loadEnvFiles(repoRoot)

  runNpmCommand(['run', 'db:generate'], 'npm run db:generate')

  const prompts = createPromptClient()
  let useMigrate = false
  try {
    useMigrate = await prompts.confirm(
      'Run prisma migrations (`npm run db:migrate`) instead of schema push (`npm run db:push`)?',
      false
    )
  } finally {
    prompts.close()
  }

  runNpmCommand(['run', useMigrate ? 'db:migrate' : 'db:push'], `npm run ${useMigrate ? 'db:migrate' : 'db:push'}`)
  await bootstrapStoreAndOwner(values)

  console.log('\nRe-running setup diagnostics...')
  const report = await runDoctor({ exitOnFailure: false })
  if (!report?.ok) {
    process.exitCode = 1
    return
  }

  console.log('\nSetup completed successfully.')
  process.exitCode = 0
}

async function collectVercelContext(existingEnv) {
  const prompts = createPromptClient()

  try {
    const token = await prompts.ask('Vercel token', {
      defaultValue: existingEnv.VERCEL_TOKEN,
      required: true,
      secret: true,
    })
    const project = await prompts.ask('Vercel project id or name', {
      defaultValue: existingEnv.VERCEL_PROJECT_ID || existingEnv.VERCEL_PROJECT_NAME,
      required: true,
    })
    const scope = await prompts.ask('Vercel scope (team slug/id, optional)', {
      defaultValue: existingEnv.VERCEL_TEAM_SLUG || existingEnv.VERCEL_TEAM_ID || '',
      required: false,
    })
    return {
      token: token.trim(),
      project: project.trim(),
      scope: scope.trim(),
    }
  } finally {
    prompts.close()
  }
}

function syncProjectLinkEnv(context) {
  const updates = {
    VERCEL_PROJECT_ID: context.project,
  }
  if (hasValue(context.scope)) {
    updates.VERCEL_TEAM_SLUG = context.scope
  }
  writeEnvLocal(updates)
}

function buildVercelGlobalArgs(context) {
  return [
    '--token',
    context.token,
    ...buildScopeArg(context.scope),
  ]
}

function ensureVercelProjectLink(context) {
  const args = [
    'link',
    '--yes',
    '--project',
    context.project,
    ...buildVercelGlobalArgs(context),
  ]
  runVercelCli(args, 'Link Vercel project')
}

function isDeployRuntimeKey(key) {
  return key === 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' || key === 'NEXT_PUBLIC_STORE_URL' || !key.startsWith('NEXT_PUBLIC_')
}

async function runEnvPush() {
  loadEnvFiles(repoRoot)
  const existingEnv = readCombinedEnv()
  const vercel = await collectVercelContext(existingEnv)
  syncProjectLinkEnv(vercel)
  ensureVercelProjectLink(vercel)

  const missing = VERCEL_ENV_KEYS.filter((key) => !hasValue(existingEnv[key]))
  if (missing.length > 0) {
    throw new Error(`Missing local env values for Vercel push: ${missing.join(', ')}`)
  }

  const envValues = Object.fromEntries(
    VERCEL_ENV_KEYS.map((key) => [key, String(existingEnv[key]).trim()])
  )

  const payload = Object.entries(envValues)
    .filter(([key]) => isDeployRuntimeKey(key))
    .map(([key, value]) => ({
      key,
      value,
      type: 'encrypted',
      target: VERCEL_ENV_TARGETS,
    }))

  await vercelApiRequest(
    vercel,
    'POST',
    `/v10/projects/${encodeURIComponent(vercel.project)}/env`,
    payload
  )

  console.log('\nVercel environment variables synced.')
  return vercel
}

async function runDbCheck() {
  loadEnvFiles(repoRoot)
  const databaseUrl = requireValue(process.env.DATABASE_URL, 'DATABASE_URL is required for db check.')
  const parsed = new URL(databaseUrl)
  const host = parsed.hostname || ''
  const isNeon = host.includes('neon.tech')
  const normalized = normalizeDatabaseUrl(databaseUrl)
  const sslmode = (() => {
    try {
      return new URL(normalized).searchParams.get('sslmode') || '(unset)'
    } catch {
      return '(invalid)'
    }
  })()

  const dependencyCheck = checkDependenciesInstalled()
  const facts = await checkDatabaseFacts(true, dependencyCheck.installed)
  if (!facts.databaseReachable) {
    throw new Error(`Database connection failed: ${facts.databaseError || 'unknown error'}`)
  }
  if (!facts.userRoleAdminSupported) {
    throw new Error('Database schema drift detected: UserRole enum is missing ADMIN. Apply latest Prisma schema changes before deploying.')
  }

  console.log('Database check passed.')
  console.log(`- Host: ${host}`)
  console.log(`- Neon host detected: ${isNeon ? 'yes' : 'no'}`)
  console.log(`- sslmode: ${sslmode}`)
  console.log(`- Store records: ${facts.storeCount ?? 0}`)
  console.log(`- OWNER users: ${facts.ownerCount ?? 0}`)
  console.log(`- UserRole.ADMIN supported: ${facts.userRoleAdminSupported ? 'yes' : 'no'}`)
}

async function runStripeWebhookAutomation() {
  loadEnvFiles(repoRoot)
  const existingEnv = readCombinedEnv()
  const prompts = createPromptClient()

  try {
    const storeUrl = await prompts.ask('Public app URL for webhook registration', {
      defaultValue: existingEnv.NEXT_PUBLIC_STORE_URL,
      required: true,
      validate: validateHttpUrl,
    })
    const stripeSecretKey = await prompts.ask('Stripe secret key', {
      defaultValue: existingEnv.STRIPE_SECRET_KEY,
      required: true,
      secret: true,
    })
    const resendApiKey = await prompts.ask('Resend API key (optional)', {
      defaultValue: existingEnv.RESEND_API_KEY || '',
      required: false,
      secret: true,
    })

    const stripeWebhookUrl = buildStripeWebhookUrl(storeUrl)
    const resendWebhookUrl = buildResendWebhookUrl(storeUrl)

    ensureHttpsUrlForWebhooks(stripeWebhookUrl, 'Stripe webhook URL')

    const stripeEndpoints = await fetchStripeWebhookEndpoints(stripeSecretKey)
    const existingStripeEndpoint = stripeEndpoints.find((endpoint) => endpoint?.url === stripeWebhookUrl)

    let stripeSecret = hasValue(existingEnv.STRIPE_WEBHOOK_SECRET) ? existingEnv.STRIPE_WEBHOOK_SECRET : ''

    if (existingStripeEndpoint && hasValue(stripeSecret)) {
      await updateStripeWebhookEndpoint(stripeSecretKey, existingStripeEndpoint.id, stripeWebhookUrl)
      console.log(`Updated existing Stripe webhook endpoint ${existingStripeEndpoint.id}.`)
    } else {
      const created = await createStripeWebhookEndpoint(stripeSecretKey, stripeWebhookUrl)
      stripeSecret = created?.secret || ''
      console.log(`Created Stripe webhook endpoint ${created?.id || '(unknown id)'}.`)
    }

    const envUpdates = {
      NEXT_PUBLIC_STORE_URL: storeUrl,
    }

    if (hasValue(stripeSecret)) {
      envUpdates.STRIPE_WEBHOOK_SECRET = stripeSecret
    }

    if (hasValue(resendApiKey)) {
      ensureHttpsUrlForWebhooks(resendWebhookUrl, 'Resend webhook URL')
      const resendWebhooks = await fetchResendWebhooks(resendApiKey)
      const existingResendWebhook = resendWebhooks.find((entry) => entry?.endpoint === resendWebhookUrl)

      let webhookId = ''
      if (existingResendWebhook) {
        webhookId = existingResendWebhook.id
        await updateResendWebhook(resendApiKey, webhookId, resendWebhookUrl)
        console.log(`Updated existing Resend webhook ${webhookId}.`)
      } else {
        const created = await createResendWebhook(resendApiKey, resendWebhookUrl)
        webhookId = created?.id || ''
        console.log(`Created Resend webhook ${webhookId || '(unknown id)'}.`)
      }

      if (hasValue(webhookId)) {
        const details = await getResendWebhook(resendApiKey, webhookId)
        if (hasValue(details?.signing_secret)) {
          envUpdates.RESEND_WEBHOOK_SECRET = details.signing_secret
        }
      }
    } else {
      console.log('Skipped Resend webhook automation because RESEND_API_KEY is not configured.')
    }

    writeEnvLocal(envUpdates)
    console.log('Updated local webhook secrets in .env.local.')
  } finally {
    prompts.close()
  }
}

async function runDeploy() {
  loadEnvFiles(repoRoot)
  const prompts = createPromptClient()
  let runDbPrecheck = true
  let runWebhookSetup = true
  let runEnvSync = true
  let vercelContext = null

  try {
    runDbPrecheck = await prompts.confirm('Run database connectivity check before deployment?', true)
    runWebhookSetup = await prompts.confirm('Configure Stripe/Resend webhooks before deployment?', true)
    runEnvSync = await prompts.confirm('Push environment variables to Vercel before deployment?', true)
  } finally {
    prompts.close()
  }

  if (runDbPrecheck) {
    await runDbCheck()
    runNpmCommand(['run', 'db:preflight-migrations'], 'npm run db:preflight-migrations')
  }

  if (runWebhookSetup) {
    await runStripeWebhookAutomation()
  }

  if (runEnvSync) {
    vercelContext = await runEnvPush()
  } else {
    const existingEnv = readCombinedEnv()
    vercelContext = await collectVercelContext(existingEnv)
    syncProjectLinkEnv(vercelContext)
    ensureVercelProjectLink(vercelContext)
  }

  console.log('\nRunning production build preflight...')
  runNpmCommand(['run', 'build'], 'npm run build')

  if (!vercelContext) {
    const existingEnv = readCombinedEnv()
    vercelContext = await collectVercelContext(existingEnv)
  }

  syncProjectLinkEnv(vercelContext)
  ensureVercelProjectLink(vercelContext)

  const deployArgs = [
    '--prod',
    '--yes',
    ...buildVercelGlobalArgs(vercelContext),
  ]
  runVercelCli(deployArgs, 'Deploy to Vercel production')

  console.log('\nDeployment command finished.')
}

async function main() {
  const [command, subcommand] = process.argv.slice(2)
  const action = [command, subcommand].filter(Boolean).join(' ').trim()

  if (!action) {
    console.error('Usage: node scripts/doopify-cli.mjs <doctor|setup|env push|stripe webhook|db check|deploy>')
    process.exitCode = 1
    return
  }

  if (action === 'doctor') {
    await runDoctor()
    return
  }

  if (action === 'setup') {
    await runSetup()
    return
  }

  if (action === 'env push') {
    await runEnvPush()
    return
  }

  if (action === 'stripe webhook') {
    await runStripeWebhookAutomation()
    return
  }

  if (action === 'db check') {
    await runDbCheck()
    return
  }

  if (action === 'deploy') {
    await runDeploy()
    return
  }

  console.error('Usage: node scripts/doopify-cli.mjs <doctor|setup|env push|stripe webhook|db check|deploy>')
  process.exitCode = 1
}

main().catch((error) => {
  console.error('Doopify CLI failed:', sanitizeErrorMessage(error))
  process.exitCode = 1
})

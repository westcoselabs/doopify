// Local synthetic benchmark only. Never loads deployment credentials.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { createInertTestEnvironment, EXTERNAL_CREDENTIAL_ENV_NAMES } from './test-environment.mjs'

const environment = createInertTestEnvironment(process.env)
const port = process.env.PERFORMANCE_PORT || '3107'
if (!['3107', '3108'].includes(port)) throw new Error('Only isolated benchmark ports 3107/3108 are allowed.')
for (const key of EXTERNAL_CREDENTIAL_ENV_NAMES) delete environment[key]
Object.assign(environment, {
  __NEXT_PROCESSED_ENV: 'true',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://doopify_test@127.0.0.1:55432/doopify_test?schema=commerce_perf&options=-c%20search_path%3Dcommerce_perf',
  PRISMA_PG_SCHEMA: 'commerce_perf',
  JWT_SECRET: 'performance-fixture-only-authentication-key',
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  EMAIL_PROVIDER: 'none',
  SHIPPING_RATE_PROVIDER: 'none',
  SHIPPING_LABEL_PROVIDER: 'none',
  MEDIA_STORAGE_PROVIDER: 'postgres',
  NEXT_PUBLIC_STORE_URL: `http://127.0.0.1:${port}`,
  JOB_RUNNER_SECRET: 'local-capacity-jobs-only',
  DATABASE_POOL_MAX: '10',
  DATABASE_POOL_TIMEOUT_MS: '5000',
  CAPACITY_TRACE: process.env.CAPACITY_TRACE === '1' ? '1' : '0',
  NEXT_OTEL_VERBOSE: process.env.CAPACITY_TRACE === '1' ? '1' : '0',
})
environment.DATA_ENCRYPTION_KEY = environment.ENCRYPTION_KEY
const observer = process.env.CAPACITY_OBSERVE === '1' ? './scripts/capacity-observer.mjs' : './scripts/performance-trace.mjs'
const child = spawn(process.execPath, ['--import', observer, 'node_modules/next/dist/bin/next', 'start', '-p', port], { env: environment, stdio: 'inherit', windowsHide: true })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill())

// Local synthetic benchmark only. Never loads deployment credentials.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { createInertTestEnvironment, EXTERNAL_CREDENTIAL_ENV_NAMES } from './test-environment.mjs'

const environment = createInertTestEnvironment(process.env)
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
  NEXT_PUBLIC_STORE_URL: 'http://127.0.0.1:3107',
})
environment.DATA_ENCRYPTION_KEY = environment.ENCRYPTION_KEY
const child = spawn(process.execPath, ['--import', './scripts/performance-trace.mjs', 'node_modules/next/dist/bin/next', 'start', '-p', '3107'], { env: environment, stdio: 'inherit', windowsHide: true })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill())

// Keep all normal test runners hermetic. Live-provider smoke checks, if ever
// needed, must live behind a separate explicit command and test-account guard.
export const EXTERNAL_CREDENTIAL_ENV_NAMES = [
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SHIPPO_API_KEY',
  'SHIPPO_WEBHOOK_SECRET',
  'EASYPOST_API_KEY',
  'EASYPOST_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USERNAME',
  'SMTP_PASSWORD',
  'SMTP_FROM_EMAIL',
  'VERCEL_TOKEN',
  'NETLIFY_AUTH_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
]

export const INERT_TEST_PROVIDER_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_doopify_inert_runner',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_doopify_inert_runner',
  STRIPE_WEBHOOK_SECRET: 'whsec_doopify_inert_runner',
  SHIPPO_API_KEY: 'shippo_inert_test_runner',
  SHIPPO_WEBHOOK_SECRET: 'shippo_webhook_inert_test_runner',
  EASYPOST_API_KEY: 'EZTK_inert_test_runner',
  EASYPOST_WEBHOOK_SECRET: 'easypost_webhook_inert_test_runner',
}

export function createInertTestEnvironment(parentEnvironment, overrides = {}) {
  const environment = { ...parentEnvironment }
  for (const name of EXTERNAL_CREDENTIAL_ENV_NAMES) delete environment[name]
  return { ...environment, ...INERT_TEST_PROVIDER_ENV, ...overrides }
}

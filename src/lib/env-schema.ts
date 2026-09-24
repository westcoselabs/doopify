import { z } from 'zod'

function optionalValue(value: unknown) {
  if (typeof value !== 'string') return value
  const normalized = value.trim()
  return !normalized || /replace[_-](me|with)|example_(key|secret)/i.test(normalized) ? undefined : normalized
}

const optionalString = z.preprocess(optionalValue, z.string().min(1).optional())
const optionalUrl = z.preprocess(optionalValue, z.string().url().optional())

export const dataEncryptionKeySchema = z.string().min(32).refine((value) => {
  const normalized = value.trim().toLowerCase()
  return !(
    /default|replace|changeme|example|sample|generate-a-random|insecure|password|secret/.test(normalized) ||
    /^(.)\1+$/.test(normalized) || new Set(normalized).size < 8 ||
    /0123456789|9876543210|abcdefghijklmnopqrstuvwxyz|zyxwvutsrqponmlkjihgfedcba/.test(normalized)
  )
}, 'must be a high-entropy, non-placeholder value')

export type DataEncryptionKeyName = 'DATA_ENCRYPTION_KEY' | 'DATA_ENCRYPTION_KEY_PREVIOUS'
const optionalDataEncryptionKey = z.preprocess((value) => typeof value === 'string' ? value.trim() || undefined : value, dataEncryptionKeySchema.optional())

/** Shared with local rotation tools; never evaluates process.env. */
export function parseDataEncryptionKey(source: Record<string, unknown>, name: DataEncryptionKeyName) {
  const value = source[name]
  const parsed = dataEncryptionKeySchema.safeParse(typeof value === 'string' ? value.trim() : value)
  if (!parsed.success) throw new Error(`${name} must be a high-entropy value of at least 32 characters before encrypted data can be used.`)
  return parsed.data
}

export const environmentFields = {
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_LEGACY_TOKEN_CUTOFF: z.string().datetime({ offset: true }).optional(),
  DATA_ENCRYPTION_KEY: optionalDataEncryptionKey,
  DATA_ENCRYPTION_KEY_PREVIOUS: optionalDataEncryptionKey,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  EMAIL_PROVIDER: z.preprocess(optionalValue, z.enum(['none', 'resend', 'smtp', 'preview']).default('none')),
  RESEND_API_KEY: optionalString,
  RESEND_WEBHOOK_SECRET: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(optionalValue, z.coerce.number().int().min(1).max(65535).default(587)),
  SMTP_SECURE: z.preprocess((value) => value === 'true' ? true : value === 'false' ? false : optionalValue(value), z.boolean().default(false)),
  SMTP_USERNAME: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM_EMAIL: optionalString,
  SHIPPO_API_KEY: optionalString,
  EASYPOST_API_KEY: optionalString,
  EASYPOST_WEBHOOK_SECRET: optionalString,
  SHIPPO_WEBHOOK_SECRET: optionalString,
  SHIPPING_RATE_PROVIDER: z.preprocess(optionalValue, z.enum(['none', 'shippo', 'easypost']).default('none')),
  SHIPPING_LABEL_PROVIDER: z.preprocess(optionalValue, z.enum(['none', 'shippo', 'easypost']).default('none')),
  MEDIA_STORAGE_PROVIDER: z.preprocess(optionalValue, z.enum(['postgres', 'vercel-blob', 's3']).default('postgres')),
  MEDIA_S3_REGION: optionalString,
  MEDIA_S3_BUCKET: optionalString,
  MEDIA_S3_ENDPOINT: optionalUrl,
  MEDIA_S3_ACCESS_KEY_ID: optionalString,
  MEDIA_S3_SECRET_ACCESS_KEY: optionalString,
  MEDIA_PUBLIC_BASE_URL: optionalUrl,
  DIGITAL_ASSET_LOCAL_DIR: optionalString,
  BLOB_READ_WRITE_TOKEN: optionalString,
  NEXT_PUBLIC_STORE_URL: optionalUrl,
  WEBHOOK_RETRY_SECRET: z.preprocess(optionalValue, z.string().min(16).optional()),
  JOB_RUNNER_SECRET: z.preprocess(optionalValue, z.string().min(16).optional()),
  ABANDONED_CHECKOUT_SECRET: z.preprocess(optionalValue, z.string().min(16).optional()),
  SETUP_TOKEN: z.preprocess(optionalValue, z.string().min(8).optional()),
  OWNER_MFA_GRACE_PERIOD_DAYS: optionalString,
  DOOPIFY_WORKER_BASE_URL: optionalUrl,
  DOOPIFY_WORKER_MODE: z.preprocess(optionalValue, z.enum(['once', 'loop']).default('loop')),
  DOOPIFY_WORKER_INTERVAL_MS: z.preprocess(optionalValue, z.coerce.number().int().positive().default(60_000)),
  DOOPIFY_WORKER_NAME: z.preprocess(optionalValue, z.string().min(1).default('doopify-worker')),
}

export const environmentBaseSchema = z.object(environmentFields)
export const envSchema = environmentBaseSchema.superRefine((value, context) => {
  if (value.NODE_ENV !== 'test' && !value.DATA_ENCRYPTION_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['DATA_ENCRYPTION_KEY'], message: 'DATA_ENCRYPTION_KEY is required outside test environments' })
  }
  if (value.NODE_ENV === 'production' && value.EMAIL_PROVIDER === 'preview') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_PROVIDER'], message: 'Email preview is unavailable in production' })
  }
  const secretMode = value.STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(test|live)_/)?.[1]
  const publicMode = value.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.match(/^pk_(test|live)_/)?.[1]
  if (secretMode && publicMode && secretMode !== publicMode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'], message: 'Stripe key modes must match' })
  }
})

export type Environment = z.infer<typeof envSchema>

export function parseEnvironment(source: Record<string, unknown>): Environment {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`)
  }
  return parsed.data
}

/** HTTP workers need runner authorization only, never commerce database or encryption credentials. */
export const workerEnvironmentSchema = environmentBaseSchema.pick({
  DOOPIFY_WORKER_BASE_URL: true, DOOPIFY_WORKER_MODE: true, DOOPIFY_WORKER_INTERVAL_MS: true,
  DOOPIFY_WORKER_NAME: true, NEXT_PUBLIC_STORE_URL: true,
  JOB_RUNNER_SECRET: true, WEBHOOK_RETRY_SECRET: true, ABANDONED_CHECKOUT_SECRET: true,
})

export const storageEnvironmentSchema = environmentBaseSchema.pick({
  DATABASE_URL: true, MEDIA_STORAGE_PROVIDER: true, MEDIA_S3_REGION: true, MEDIA_S3_BUCKET: true,
  MEDIA_S3_ENDPOINT: true, MEDIA_S3_ACCESS_KEY_ID: true, MEDIA_S3_SECRET_ACCESS_KEY: true,
  MEDIA_PUBLIC_BASE_URL: true, BLOB_READ_WRITE_TOKEN: true,
})

export function parseEnvironmentSubset<T extends z.ZodTypeAny>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) throw new Error(`Invalid environment configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`)
  return result.data
}

export const integrationIds = ['stripe', 'resend', 'smtp', 'shippo', 'easypost', 'storage', 'jobs'] as const
export type IntegrationId = typeof integrationIds[number]
export type IntegrationStatus = { id: IntegrationId; configured: boolean; missing: string[]; mode: 'test' | 'live' | null; webhookReady: boolean | null }

export function getEnvironmentIntegrationStatuses(config: Partial<Environment>): IntegrationStatus[] {
  const required: Record<IntegrationId, Array<keyof Environment>> = {
    stripe: ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
    resend: ['RESEND_API_KEY'], smtp: ['SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD'],
    shippo: ['SHIPPO_API_KEY'], easypost: ['EASYPOST_API_KEY'],
    storage: config.MEDIA_STORAGE_PROVIDER === 's3' ? ['MEDIA_S3_REGION', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY'] : config.MEDIA_STORAGE_PROVIDER === 'vercel-blob' ? ['BLOB_READ_WRITE_TOKEN'] : [],
    jobs: ['WEBHOOK_RETRY_SECRET'],
  }
  return integrationIds.map((id) => {
    const missing = required[id].filter((name) => !config[name])
    const mode = id === 'stripe' ? config.STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(test|live)_/)?.[1] : null
    return { id, configured: missing.length === 0, missing, mode: mode === 'test' || mode === 'live' ? mode : null,
      webhookReady: id === 'stripe' ? Boolean(config.STRIPE_WEBHOOK_SECRET) : id === 'resend' ? Boolean(config.RESEND_WEBHOOK_SECRET) : id === 'shippo' ? Boolean(config.SHIPPO_WEBHOOK_SECRET) : id === 'easypost' ? Boolean(config.EASYPOST_WEBHOOK_SECRET) : null }
  })
}

/** Doctor can describe incomplete configuration without loading the guarded app runtime. */
export function inspectEnvironment(source: Record<string, unknown>) {
  const config = Object.fromEntries(Object.entries(environmentFields).map(([name, schema]) => {
    const parsed = schema.safeParse(source[name])
    return [name, parsed.success ? parsed.data : undefined]
  })) as Partial<Environment>
  const parsed = envSchema.safeParse(source)
  return { config, issues: parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))], integrations: getEnvironmentIntegrationStatuses(config) }
}

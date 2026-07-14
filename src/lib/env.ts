import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_LEGACY_TOKEN_CUTOFF: z.string().datetime({ offset: true, message: 'SESSION_LEGACY_TOKEN_CUTOFF must be an absolute ISO-8601 timestamp' }).optional(),
  ENCRYPTION_KEY: z.string().trim().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  ENCRYPTION_KEY_PREVIOUS: z.string().trim().min(32, 'ENCRYPTION_KEY_PREVIOUS must be at least 32 characters').optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.string().min(1).optional(),
  SMTP_SECURE: z.string().min(1).optional(),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_EMAIL: z.string().min(1).optional(),
  SHIPPO_API_KEY: z.string().min(1).optional(),
  EASYPOST_API_KEY: z.string().min(1).optional(),
  EASYPOST_WEBHOOK_SECRET: z.string().min(1).optional(),
  SHIPPO_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STORE_URL: z.string().url().optional(),
  WEBHOOK_RETRY_SECRET: z.string().min(16).optional(),
  JOB_RUNNER_SECRET: z.string().min(16).optional(),
  ABANDONED_CHECKOUT_SECRET: z.string().min(16).optional(),
  SETUP_TOKEN: z.string().min(8).optional(),
  OWNER_MFA_GRACE_PERIOD_DAYS: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'test' && !value.ENCRYPTION_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ENCRYPTION_KEY'],
      message: 'ENCRYPTION_KEY is required outside test environments',
    })
  }
  for (const keyName of ['ENCRYPTION_KEY', 'ENCRYPTION_KEY_PREVIOUS'] as const) {
    const key = value[keyName]
    if (!key) continue
    const normalized = key.toLowerCase()
    const unsafe =
      /default|replace|changeme|example|sample|generate-a-random|insecure|password|secret/.test(normalized) ||
      /^(.)\1+$/.test(normalized) ||
      new Set(normalized).size < 8 ||
      /0123456789|9876543210|abcdefghijklmnopqrstuvwxyz|zyxwvutsrqponmlkjihgfedcba/.test(normalized)
    if (unsafe) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [keyName], message: `${keyName} must be a high-entropy, non-placeholder value` })
    }
  }
})

export const env = envSchema.parse({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
})

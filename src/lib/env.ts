import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ENCRYPTION_KEY: z.string().trim().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
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
  if (value.NODE_ENV === 'production' && !value.ENCRYPTION_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ENCRYPTION_KEY'],
      message: 'ENCRYPTION_KEY is required in production',
    })
  }
})

export const env = envSchema.parse({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
})

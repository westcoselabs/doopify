import 'server-only'
import nodemailer from 'nodemailer'
import { env } from '@/lib/env'

export type SendEmailInput = { from: string; to: string[]; subject: string; html: string }
export type SendEmailResult = { provider: 'resend' | 'smtp' | 'preview'; providerMessageId?: string }

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | undefined

export function isTransactionalEmailConfigured() {
  if (env.EMAIL_PROVIDER === 'resend') return Boolean(env.RESEND_API_KEY)
  if (env.EMAIL_PROVIDER === 'smtp') return Boolean(env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD)
  return false
}

export function getSmtpTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USERNAME || !env.SMTP_PASSWORD) {
    throw new Error('SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD are required for SMTP')
  }
  smtpTransport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 5_000,
  })
  return smtpTransport
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (env.EMAIL_PROVIDER === 'preview' && env.NODE_ENV !== 'production') {
    return { provider: 'preview' }
  }
  if (!isTransactionalEmailConfigured()) {
    throw new Error('Transactional email is not configured. Set EMAIL_PROVIDER and its environment credentials.')
  }
  if (env.EMAIL_PROVIDER === 'smtp') {
    try {
      const result = await getSmtpTransport().sendMail(input)
      if (result.rejected?.length) throw new Error('SMTP rejected a recipient')
      return { provider: 'smtp', providerMessageId: result.messageId }
    } catch {
      throw new Error('SMTP email delivery failed')
    }
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Resend email delivery failed (${response.status})`)
  const payload = await response.json() as { id?: unknown }
  return { provider: 'resend', providerMessageId: typeof payload.id === 'string' ? payload.id : undefined }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ env: { EMAIL_PROVIDER: 'none', NODE_ENV: 'test', RESEND_API_KEY: undefined as string | undefined, SMTP_HOST: 'smtp.example.com', SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USERNAME: 'user', SMTP_PASSWORD: 'private-password' }, transport: vi.fn(), sendMail: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.transport } }))
import { isTransactionalEmailConfigured, sendTransactionalEmail } from './provider'
const input = { from: 'Store <store@example.com>', to: ['buyer@example.com'], subject: 'Order confirmation', html: '<p>Paid</p>' }
describe('environment email adapter', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.env.EMAIL_PROVIDER = 'none'; mocks.env.NODE_ENV = 'test'; mocks.env.RESEND_API_KEY = undefined; mocks.transport.mockReturnValue({ sendMail: mocks.sendMail }) })
  it('never reports successful delivery when disabled or missing its selected credentials', async () => {
    expect(isTransactionalEmailConfigured()).toBe(false)
    await expect(sendTransactionalEmail(input)).rejects.toThrow('not configured')
    mocks.env.EMAIL_PROVIDER = 'resend'
    await expect(sendTransactionalEmail(input)).rejects.toThrow('not configured')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
  })
  it('allows explicit preview only outside production', async () => {
    mocks.env.EMAIL_PROVIDER = 'preview'
    expect(await sendTransactionalEmail(input)).toEqual({ provider: 'preview' })
    mocks.env.NODE_ENV = 'production'
    await expect(sendTransactionalEmail(input)).rejects.toThrow('not configured')
  })
  it('sends through selected SMTP using the business sender and bounded transport', async () => {
    mocks.env.EMAIL_PROVIDER = 'smtp'; mocks.sendMail.mockResolvedValue({ messageId: 'smtp_1', rejected: [] })
    expect(await sendTransactionalEmail(input)).toEqual({ provider: 'smtp', providerMessageId: 'smtp_1' })
    expect(mocks.sendMail).toHaveBeenCalledWith(input)
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, connectionTimeout: 5000, socketTimeout: 5000 }))
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('does not leak SMTP provider errors or count rejected recipients as delivered', async () => {
    mocks.env.EMAIL_PROVIDER = 'smtp'; mocks.sendMail.mockResolvedValue({ rejected: ['buyer@example.com'] })
    await expect(sendTransactionalEmail(input)).rejects.toThrow('SMTP email delivery failed')
    mocks.sendMail.mockRejectedValue(new Error('private-password'))
    await expect(sendTransactionalEmail(input)).rejects.toThrow('SMTP email delivery failed')
  })
  it('sends Resend payload with timeout and excludes failed provider response bodies', async () => {
    mocks.env.EMAIL_PROVIDER = 'resend'; mocks.env.RESEND_API_KEY = 're_private'
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'resend_1' }) })
    expect(await sendTransactionalEmail(input)).toEqual({ provider: 'resend', providerMessageId: 'resend_1' })
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', body: JSON.stringify(input), signal: expect.any(AbortSignal) }))
    mocks.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 're_private' })
    await expect(sendTransactionalEmail(input)).rejects.toThrow('Resend email delivery failed (401)')
  })
})

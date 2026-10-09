import { beforeEach, describe, expect, it, vi } from 'vitest'
const env = vi.hoisted(() => ({ STRIPE_SECRET_KEY: 'sk_test_private', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_public', STRIPE_WEBHOOK_SECRET: 'whsec_private', RESEND_API_KEY: undefined as string | undefined, MEDIA_STORAGE_PROVIDER: 'postgres', EMAIL_PROVIDER: 'none' }))
vi.mock('@/lib/env', () => ({ env }))
vi.mock('@/lib/prisma', () => { throw new Error('Config status must not import Prisma') })
vi.mock('@/server/utils/crypto', () => { throw new Error('Config status must not decrypt data') })
import { getIntegrationStatuses, testIntegration } from './integration-status'
describe('integration status', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); env.RESEND_API_KEY = undefined })
  it('computes safe presence states without database, crypto or network calls', () => {
    const statuses = getIntegrationStatuses()
    expect(statuses.find((s) => s.id === 'stripe')).toEqual({ id: 'stripe', configured: true, missing: [], mode: 'test', webhookReady: true })
    expect(statuses.find((s) => s.id === 'resend')).toMatchObject({ configured: false, missing: ['RESEND_API_KEY'] })
    expect(JSON.stringify(statuses)).not.toContain('private')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not call an unconfigured provider', async () => {
    expect(await testIntegration('resend')).toMatchObject({ ok: false })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('only performs an explicit bounded read and hides remote errors', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401, body: null } as Response)
    expect(await testIntegration('stripe')).toMatchObject({ ok: false, error: 'Provider check returned HTTP 401.' })
    expect(fetch).toHaveBeenCalledWith('https://api.stripe.com/v1/account', expect.objectContaining({ signal: expect.any(AbortSignal), cache: 'no-store' }))
    vi.mocked(fetch).mockRejectedValue(new Error('sk_test_private'))
    expect(JSON.stringify(await testIntegration('stripe'))).not.toContain('sk_test_private')
  })
})

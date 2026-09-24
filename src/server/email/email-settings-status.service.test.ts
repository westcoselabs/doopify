import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ findPrimaryStore: vi.fn(), getEmailJobHealthSnapshot: vi.fn(), isTransactionalEmailConfigured: vi.fn(), env: { EMAIL_PROVIDER: 'resend' } }))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/server/services/primary-store.service', () => ({ findPrimaryStore: mocks.findPrimaryStore }))
vi.mock('@/server/email/provider', () => ({ isTransactionalEmailConfigured: mocks.isTransactionalEmailConfigured }))
vi.mock('@/server/jobs/email-job-health.service', () => ({ getEmailJobHealthSnapshot: mocks.getEmailJobHealthSnapshot }))
import { getEmailSettingsStatusSnapshot } from './email-settings-status.service'
describe('email settings status', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.env.EMAIL_PROVIDER = 'resend'; mocks.findPrimaryStore.mockResolvedValue({ email: 'store@example.com' }); mocks.getEmailJobHealthSnapshot.mockResolvedValue({ level: 'healthy' }); mocks.isTransactionalEmailConfigured.mockReturnValue(true) })
  it('separates business sender from environment presence and job health', async () => {
    expect(await getEmailSettingsStatusSnapshot()).toEqual({ senderConfigured: true, providerConfigured: true, provider: 'RESEND', jobHealthStatus: 'healthy' })
    expect(mocks.findPrimaryStore).toHaveBeenCalledWith({ select: { email: true } })
  })
  it('reports missing business and environment settings independently', async () => {
    mocks.findPrimaryStore.mockResolvedValue({ email: null }); mocks.isTransactionalEmailConfigured.mockReturnValue(false); mocks.env.EMAIL_PROVIDER = 'smtp'
    expect(await getEmailSettingsStatusSnapshot()).toMatchObject({ senderConfigured: false, providerConfigured: false, provider: 'SMTP' })
  })
  it('preserves an unknown health state when the job query fails', async () => {
    mocks.getEmailJobHealthSnapshot.mockRejectedValue(new Error('database unavailable'))
    expect((await getEmailSettingsStatusSnapshot()).jobHealthStatus).toBe('unknown')
  })
})

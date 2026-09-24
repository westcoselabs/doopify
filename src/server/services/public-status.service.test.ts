import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), emailConfigured: vi.fn(), statuses: vi.fn(), env: { EMAIL_PROVIDER: 'resend', MEDIA_STORAGE_PROVIDER: 'postgres' } }))
vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRawUnsafe: mocks.query } }))
vi.mock('@/server/config/integration-status', () => ({ getIntegrationStatuses: mocks.statuses }))
vi.mock('@/server/email/provider', () => ({ isTransactionalEmailConfigured: mocks.emailConfigured }))
import { buildPublicStatusReport } from './public-status.service'
describe('public status', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([]); mocks.statuses.mockReturnValue([{ id: 'stripe', configured: true }]); mocks.emailConfigured.mockReturnValue(true) })
  it('uses one database liveness query and safe config states', async () => {
    const report = await buildPublicStatusReport()
    expect(report).toMatchObject({ app: 'ok', database: 'reachable', stripe: 'configured', email: 'configured', mediaStorage: { provider: 'postgres' } })
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith('SELECT 1')
    expect(JSON.stringify(report)).not.toContain('secret')
  })
  it('contains database failures without exposing connection details', async () => {
    mocks.query.mockRejectedValue(new Error('postgresql://private:password@example.com'))
    const report = await buildPublicStatusReport()
    expect(report.database).toBe('unreachable')
    expect(JSON.stringify(report)).not.toContain('password')
  })
})

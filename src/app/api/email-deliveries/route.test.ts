import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEmailDeliveries: vi.fn(),
  getEmailJobHealthSnapshot: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/server/services/email-delivery.service', () => ({
  EMAIL_DELIVERY_STATUSES: ['PENDING', 'SENT', 'FAILED', 'BOUNCED', 'COMPLAINED', 'RETRYING', 'RESEND_REQUESTED'],
  getEmailDeliveries: mocks.getEmailDeliveries,
}))
vi.mock('@/server/jobs/email-job-health.service', () => ({
  getEmailJobHealthSnapshot: mocks.getEmailJobHealthSnapshot,
}))
vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

import { GET } from './route'

describe('GET /api/email-deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      user: { id: 'staff-1', email: 'staff@example.com', firstName: null, lastName: null, role: 'STAFF' },
    })
    mocks.getEmailJobHealthSnapshot.mockResolvedValue({
      level: 'healthy',
      message: 'Email delivery processing is healthy.',
      queuedCount: 0,
      dueCount: 0,
      runningCount: 0,
      failedCount: 0,
      oldestDueAgeMinutes: null,
      runner: {
        health: 'healthy',
        totalRunners: 1,
        failingRunners: 0,
        latestSeenAt: '2026-05-20T00:00:00.000Z',
      },
      thresholds: {
        warningDue: 5,
        criticalDue: 25,
        warningFailed: 1,
        criticalFailed: 5,
        warningAgeMinutes: 10,
        criticalAgeMinutes: 30,
        runnerStaleMinutes: 10,
      },
    })
  })

  it('returns paginated email deliveries with filters', async () => {
    mocks.getEmailDeliveries.mockResolvedValue({
      deliveries: [{ id: 'email-1', status: 'FAILED' }],
      pagination: { page: 2, pageSize: 5, total: 1, totalPages: 1 },
    })

    const response = await GET(
      new Request('http://localhost/api/email-deliveries?status=FAILED&template=fulfillment_tracking&page=2&pageSize=5')
    )

    expect(response.status).toBe(200)
    expect(mocks.getEmailDeliveries).toHaveBeenCalledWith({
      status: 'FAILED',
      template: 'fulfillment_tracking',
      page: 2,
      pageSize: 5,
    })
    expect(mocks.getEmailJobHealthSnapshot).toHaveBeenCalled()
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data.jobHealth).toMatchObject({
      level: 'healthy',
      queuedCount: 0,
      failedCount: 0,
    })
  })

  it('returns 400 for invalid status', async () => {
    const response = await GET(new Request('http://localhost/api/email-deliveries?status=INVALID'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid email delivery status',
    })
  })

  it('returns 400 for invalid template', async () => {
    const response = await GET(new Request('http://localhost/api/email-deliveries?template=INVALID'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid email delivery template',
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    session: {
      findUnique: mocks.findUnique,
      deleteMany: mocks.deleteMany,
    },
  },
}))

import { signToken, verifyToken } from './auth'
import { hashSessionToken } from './session-token'

const payload = {
  userId: 'user_1',
  email: 'owner@example.com',
  role: 'OWNER' as const,
  sessionId: 'session_1',
}

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_1',
    tokenHash: null,
    legacyToken: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'user_1', email: 'owner@example.com', isActive: true },
    ...overrides,
  }
}

describe('legacy session cutoff enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SESSION_LEGACY_TOKEN_CUTOFF
  })

  afterEach(() => {
    delete process.env.SESSION_LEGACY_TOKEN_CUTOFF
  })

  it('accepts an otherwise valid legacy session only before an explicit future cutoff', async () => {
    const token = signToken(payload)
    process.env.SESSION_LEGACY_TOKEN_CUTOFF = new Date(Date.now() + 60_000).toISOString()
    mocks.findUnique.mockResolvedValue(activeSession({ legacyToken: token }))
    await expect(verifyToken(token)).resolves.toMatchObject({ sessionId: 'session_1' })
  })

  it('rejects legacy sessions for expired, missing, and invalid cutoffs', async () => {
    const token = signToken(payload)
    mocks.findUnique.mockResolvedValue(activeSession({ legacyToken: token }))

    for (const cutoff of ['2000-01-01T00:00:00.000Z', undefined, 'invalid-cutoff']) {
      if (cutoff) process.env.SESSION_LEGACY_TOKEN_CUTOFF = cutoff
      else delete process.env.SESSION_LEGACY_TOKEN_CUTOFF
      await expect(verifyToken(token)).resolves.toBeNull()
    }
  })

  it('keeps hash-based sessions valid without a legacy cutoff', async () => {
    const token = signToken(payload)
    mocks.findUnique.mockResolvedValue(activeSession({ tokenHash: hashSessionToken(token) }))
    await expect(verifyToken(token)).resolves.toMatchObject({ sessionId: 'session_1' })
  })
})

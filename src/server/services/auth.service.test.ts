import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  bcryptHash: vi.fn(),
  bcryptCompare: vi.fn(),
  signToken: vi.fn(),
  getCookieValue: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth', () => ({
  signToken: mocks.signToken,
  AUTH_COOKIE: 'doopify_token',
}))
vi.mock('@/lib/cookies', () => ({ getCookieValue: mocks.getCookieValue }))
vi.mock('bcryptjs', () => ({
  default: { hash: mocks.bcryptHash, compare: mocks.bcryptCompare },
}))

import { changePassword, revokeOtherSessions } from './auth.service'
import { hashSessionToken } from '@/lib/session-token'

describe('auth service — changePassword / revokeOtherSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bcryptHash.mockResolvedValue('new_hashed_pw')
    mocks.bcryptCompare.mockResolvedValue(true)
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(mocks.prisma))
    mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 })
    mocks.prisma.user.update.mockResolvedValue({ id: 'u1' })
  })

  describe('changePassword', () => {
    it('hashes new password and revokes other sessions on success', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'old_hash',
        isActive: true,
      })

      await changePassword('u1', 'correct_current', 'new_password_123', 'current_session_token')

      expect(mocks.bcryptCompare).toHaveBeenCalledWith('correct_current', 'old_hash')
      expect(mocks.bcryptHash).toHaveBeenCalledWith('new_password_123', 12)
      expect(mocks.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new_hashed_pw' },
      })
      expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          NOT: { OR: [{ tokenHash: hashSessionToken('current_session_token') }, { legacyToken: 'current_session_token' }] },
        },
      })
    })

    it('throws when current password is incorrect', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'old_hash',
        isActive: true,
      })
      mocks.bcryptCompare.mockResolvedValue(false)

      await expect(
        changePassword('u1', 'wrong_password', 'new_password_123', null)
      ).rejects.toThrow('Current password is incorrect')
    })

    it('throws when new password is too short', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'old_hash',
        isActive: true,
      })

      await expect(
        changePassword('u1', 'correct_current', 'short', null)
      ).rejects.toThrow('at least 8 characters')
    })

    it('throws when user is disabled', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'old_hash',
        isActive: false,
      })

      await expect(
        changePassword('u1', 'correct_current', 'new_password_123', null)
      ).rejects.toThrow('disabled')
    })

    it('revokes all sessions when no current token provided', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: 'old_hash',
        isActive: true,
      })

      await changePassword('u1', 'correct_current', 'new_password_123', null)

      expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })
  })

  describe('revokeOtherSessions', () => {
    it('deletes all sessions except the current token', async () => {
      mocks.prisma.session.deleteMany.mockResolvedValue({ count: 3 })

      const count = await revokeOtherSessions('u1', 'keep_this_token')

      expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          NOT: { OR: [{ tokenHash: hashSessionToken('keep_this_token') }, { legacyToken: 'keep_this_token' }] },
        },
      })
      expect(count).toBe(3)
    })

    it('returns 0 when no other sessions exist', async () => {
      mocks.prisma.session.deleteMany.mockResolvedValue({ count: 0 })
      const count = await revokeOtherSessions('u1', 'only_session')
      expect(count).toBe(0)
    })
  })
})

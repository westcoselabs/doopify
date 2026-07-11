import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import type { UserRole } from '@prisma/client'

import { signToken, AUTH_COOKIE } from '@/lib/auth'
import { getCookieValue } from '@/lib/cookies'
import { prisma } from '@/lib/prisma'
import { hashSessionToken } from '@/lib/session-token'

export type SessionContext = {
  ip?: string | null
  userAgent?: string | null
}

export type AuthenticatedUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: UserRole
  isActive: boolean
  mfaTotpSecretEnc: string | null
  mfaEnabledAt: Date | null
  mfaGracePeriodEndsAt: Date | null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function authenticateUserCredentials(
  email: string,
  password: string
): Promise<AuthenticatedUser> {
  const normalizedEmail = normalizeEmail(email)
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      mfaTotpSecretEnc: true,
      mfaEnabledAt: true,
      mfaGracePeriodEndsAt: true,
    },
  })

  if (!user || !user.isActive) {
    throw new Error('Invalid email or password')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new Error('Invalid email or password')
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    mfaTotpSecretEnc: user.mfaTotpSecretEnc,
    mfaEnabledAt: user.mfaEnabledAt,
    mfaGracePeriodEndsAt: user.mfaGracePeriodEndsAt,
  }
}

export async function createSessionForUser(
  user: Pick<AuthenticatedUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>,
  context?: SessionContext
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const session = await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(randomBytes(32).toString('base64url')),
      userId: user.id,
      expiresAt,
      ip: context?.ip ?? undefined,
      userAgent: context?.userAgent ?? undefined,
    },
  })

  const token = signToken({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    sessionId: session.id,
  })

  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashSessionToken(token) },
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  }
}

export async function loginUser(email: string, password: string, context?: SessionContext) {
  const user = await authenticateUserCredentials(email, password)
  return createSessionForUser(user, context)
}

export async function logoutUser(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
}

export async function createUser(data: {
  email: string
  password: string
  firstName?: string
  lastName?: string
  role?: UserRole
}) {
  const passwordHash = await bcrypt.hash(data.password, 12)

  return prisma.user.create({
    data: {
      email: normalizeEmail(data.email),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role ?? 'STAFF',
    },
  })
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionToken?: string | null
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isActive: true },
  })
  if (!user || !user.isActive) throw new Error('User not found or account is disabled.')

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new Error('Current password is incorrect.')

  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.')

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    if (currentSessionToken) {
      await tx.session.deleteMany({ where: { userId, NOT: { tokenHash: hashSessionToken(currentSessionToken) } } })
    } else {
      await tx.session.deleteMany({ where: { userId } })
    }
  })
}

export async function revokeOtherSessions(userId: string, currentSessionToken: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId, NOT: { tokenHash: hashSessionToken(currentSessionToken) } },
  })
  return count
}

export function getTokenFromCookieHeader(cookieHeader: string | null): string | null {
  return getCookieValue(cookieHeader, AUTH_COOKIE)
}

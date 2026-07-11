#!/usr/bin/env node
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { decrypt, encrypt, isCurrentEncryptionEnvelope } from '../src/server/utils/crypto.ts'

type RotationTarget = {
  kind: 'integrationSecret' | 'integrationWebhookSecret' | 'userMfaSecret' | 'userPendingMfaSecret' | 'digitalDownloadToken'
  id: string
  value: string
  apply: (nextValue: string) => Promise<unknown>
}

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const help = args.has('--help') || args.has('-h')

function printUsage() {
  console.log('Usage: npm run secrets:reencrypt -- [--dry-run|--apply --confirm-reencrypt]')
  console.log('Reads only by default. It never prints secret values or generates keys.')
}

function safeFailureKind(error: unknown) {
  return error instanceof Error && error.message.includes('configured encryption keys')
    ? 'unreadable'
    : 'invalid'
}

if (help) {
  printUsage()
  process.exit(0)
}

if (apply && !args.has('--confirm-reencrypt')) {
  console.error('Refusing to write. Use --apply --confirm-reencrypt after reviewing dry-run metadata.')
  process.exit(1)
}

const connectionString = String(process.env.DATABASE_URL || '').trim()
if (!connectionString) {
  console.error('DATABASE_URL is required. No database connection was attempted.')
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
})

try {
  const [integrationSecrets, integrations, users, deliveries] = await Promise.all([
    prisma.integrationSecret.findMany({ select: { id: true, value: true } }),
    prisma.integration.findMany({ where: { webhookSecret: { not: null } }, select: { id: true, webhookSecret: true } }),
    prisma.user.findMany({
      where: {
        OR: [
          { mfaTotpSecretEnc: { not: null } },
          { mfaTotpPendingSecretEnc: { not: null } },
        ],
      },
      select: { id: true, mfaTotpSecretEnc: true, mfaTotpPendingSecretEnc: true },
    }),
    prisma.digitalDownloadDelivery.findMany({ select: { id: true, tokenEnc: true } }),
  ])

  const targets: RotationTarget[] = [
    ...integrationSecrets.map((record) => ({
      kind: 'integrationSecret' as const,
      id: record.id,
      value: record.value,
      apply: (nextValue: string) => prisma.integrationSecret.update({ where: { id: record.id }, data: { value: nextValue } }),
    })),
    ...integrations.flatMap((record) => record.webhookSecret ? [{
      kind: 'integrationWebhookSecret' as const,
      id: record.id,
      value: record.webhookSecret,
      apply: (nextValue: string) => prisma.integration.update({ where: { id: record.id }, data: { webhookSecret: nextValue } }),
    }] : []),
    ...users.flatMap((record) => [
      ...(record.mfaTotpSecretEnc ? [{
        kind: 'userMfaSecret' as const,
        id: record.id,
        value: record.mfaTotpSecretEnc,
        apply: (nextValue: string) => prisma.user.update({ where: { id: record.id }, data: { mfaTotpSecretEnc: nextValue } }),
      }] : []),
      ...(record.mfaTotpPendingSecretEnc ? [{
        kind: 'userPendingMfaSecret' as const,
        id: record.id,
        value: record.mfaTotpPendingSecretEnc,
        apply: (nextValue: string) => prisma.user.update({ where: { id: record.id }, data: { mfaTotpPendingSecretEnc: nextValue } }),
      }] : []),
    ]),
    ...deliveries.map((record) => ({
      kind: 'digitalDownloadToken' as const,
      id: record.id,
      value: record.tokenEnc,
      apply: (nextValue: string) => prisma.digitalDownloadDelivery.update({ where: { id: record.id }, data: { tokenEnc: nextValue } }),
    })),
  ]

  const report: Record<string, { current: number; needsRotation: number; unreadable: number; invalid: number; applied: number }> = {}
  for (const target of targets) {
    report[target.kind] ??= { current: 0, needsRotation: 0, unreadable: 0, invalid: 0, applied: 0 }
    try {
      const plaintext = decrypt(target.value)
      if (isCurrentEncryptionEnvelope(target.value)) {
        report[target.kind].current += 1
        continue
      }

      const replacement = encrypt(plaintext)
      if (decrypt(replacement) !== plaintext || !isCurrentEncryptionEnvelope(replacement)) {
        throw new Error('replacement verification failed')
      }
      report[target.kind].needsRotation += 1
      if (apply) {
        await target.apply(replacement)
        report[target.kind].applied += 1
      }
    } catch (error) {
      report[target.kind][safeFailureKind(error)] += 1
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    targets: report,
    guidance: apply
      ? 'If any row is unreadable or invalid, keep ENCRYPTION_KEY_PREVIOUS configured and restore that row from a verified backup before retrying.'
      : 'Review counts, configure ENCRYPTION_KEY_PREVIOUS during the overlap window, then rerun with --apply --confirm-reencrypt.',
  }, null, 2))

  if (Object.values(report).some((entry) => entry.unreadable || entry.invalid)) {
    process.exitCode = 2
  }
} finally {
  await prisma.$disconnect()
}

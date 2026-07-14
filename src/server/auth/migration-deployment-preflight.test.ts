import { describe, expect, it } from 'vitest'

import { evaluateMigrationDeploymentSafety } from '../../../scripts/migration-deployment-preflight.mjs'

describe('migration deployment preflight', () => {
  const base = {
    migrationsTableExists: true,
    hasApplicationTables: true,
    sessionsTableExists: true,
    sessionCount: 0,
    providerDuplicateCount: 0,
    appliedMigrationNames: [],
  }

  it('permits a fresh database', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, migrationsTableExists: false, hasApplicationTables: false, sessionsTableExists: false })).toMatchObject({ ok: true })
  })

  it('fails closed before the destructive session migration can delete active sessions', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, sessionCount: 2 })).toMatchObject({ ok: false })
  })

  it('permits a deployment once the destructive migration is already recorded', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, sessionCount: 2, appliedMigrationNames: ['20260710_hash_persisted_sessions'] })).toMatchObject({ ok: true })
  })

  it('blocks the unsafe provider migration when duplicate provider groups exist', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, providerDuplicateCount: 1 })).toMatchObject({ ok: false })
  })
})

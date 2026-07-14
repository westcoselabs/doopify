import { describe, expect, it } from 'vitest'

import { evaluateMigrationDeploymentSafety } from '../../../scripts/migration-deployment-preflight.mjs'

describe('migration deployment preflight', () => {
  const base = {
    migrationsTableExists: true,
    hasUserSchemaObjects: true,
    appliedMigrationNames: [],
    failedMigrationNames: [],
  }

  it('permits a fresh database', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, migrationsTableExists: false, hasUserSchemaObjects: false })).toMatchObject({ ok: true })
  })

  it('fails closed before the destructive session migration can delete active sessions', () => {
    expect(evaluateMigrationDeploymentSafety(base)).toMatchObject({ ok: false })
  })

  it('permits a deployment once the destructive migration is already recorded', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, appliedMigrationNames: ['20260710_hash_persisted_sessions', '20260711_provider_and_store_singletons'] })).toMatchObject({ ok: true })
  })

  it('blocks the unsafe provider migration on every existing schema, even before duplicate rows are counted', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, appliedMigrationNames: ['20260710_hash_persisted_sessions'] })).toMatchObject({ ok: false })
  })

  it('blocks failed singleton history until the operator explicitly resolves it', () => {
    expect(evaluateMigrationDeploymentSafety({ ...base, appliedMigrationNames: ['20260710_hash_persisted_sessions'], failedMigrationNames: ['20260711_provider_and_store_singletons'] })).toMatchObject({ ok: false })
  })
})

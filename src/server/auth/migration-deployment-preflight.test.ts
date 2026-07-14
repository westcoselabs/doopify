import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { discoverLocalMigrationNames, evaluateMigrationDeploymentSafety, validateLocalMigrationNames } from '../../../scripts/migration-deployment-preflight.mjs'

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

  it('fails closed when a well-formed database history includes an unknown migration name', () => {
    const result = evaluateMigrationDeploymentSafety({
      ...base,
      appliedMigrationNames: ['20260710_hash_persisted_sessions', '20260711_provider_and_store_singletons', '20990101_unknown'],
      unknownMigrationHistory: true,
      unknownMigrationNames: ['20990101_unknown'],
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.failures.join(' ')).toContain('20990101_unknown')
  })

  it('fails closed when local migration directory discovery is unavailable', async () => {
    await expect(discoverLocalMigrationNames(path.join(process.cwd(), 'missing-migrations-directory'))).rejects.toThrow('Unable to discover')
  })

  it('fails closed for malformed or duplicate discovered migration names', () => {
    expect(() => validateLocalMigrationNames(['not-a-migration'])).toThrow('malformed')
    expect(() => validateLocalMigrationNames(['20260710_example', '20260710_EXAMPLE'])).toThrow('duplicate')
  })
})

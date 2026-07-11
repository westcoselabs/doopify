import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsRoot = path.join(process.cwd(), 'prisma', 'migrations')

describe('session migration safety', () => {
  it('keeps the corrective rollout additive and does not add another session-table delete', () => {
    const migrationDirectories = fs.readdirSync(migrationsRoot)
      .filter((entry) => entry.includes('session'))

    const destructiveMigrations = migrationDirectories
      .filter((entry) => entry !== '20260710_hash_persisted_sessions')
      .filter((entry) => {
        const migrationPath = path.join(migrationsRoot, entry, 'migration.sql')
        return fs.existsSync(migrationPath) && /DELETE\s+FROM\s+"sessions"/i.test(fs.readFileSync(migrationPath, 'utf8'))
      })

    expect(destructiveMigrations).toEqual([])
    expect(
      fs.readFileSync(
        path.join(migrationsRoot, '20260713_session_hash_compatibility', 'migration.sql'),
        'utf8'
      )
    ).not.toMatch(/DELETE\s+FROM\s+"sessions"/i)
  })
})

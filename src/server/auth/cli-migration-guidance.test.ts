import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CLI migration recovery guidance', () => {
  it('directs existing and production databases through the safe deployment path', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'doopify-cli.mjs'), 'utf8')
    expect(source).toContain('npm run db:deploy:safe')
    expect(source).toContain('disposable local development database')
    expect(source).not.toContain('`npm run db:push` or prisma migrate deploy')
  })
})

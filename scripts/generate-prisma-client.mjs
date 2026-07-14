import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url))
const env = { ...process.env }

// Prisma evaluates datasource env() while generating its client even though it
// does not connect. Keep fresh installs reproducible without weakening the
// application's runtime DATABASE_URL validation.
if (!env.DATABASE_URL) {
  env.DATABASE_URL = 'postgresql://prisma_codegen:prisma_codegen@127.0.0.1:5432/prisma_codegen?schema=public'
  console.info('DATABASE_URL is not set; using an unreachable placeholder for Prisma client generation.')
}

const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)

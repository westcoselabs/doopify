import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'

const label = process.argv[2] ?? 'after'
if (!['baseline', 'after'].includes(label)) throw new Error('Expected baseline or after')
const route = label === 'baseline' ? '/settings' : '/admin/settings/general'
const context = {}
runInNewContext(readFileSync(`.next/server/app/(dashboard)${route}/page_client-reference-manifest.js`, 'utf8'), context)
const manifest = Object.values(context.__RSC_MANIFEST)[0]
const entries = Object.entries(manifest.entryJSFiles)
const shared = new Set(entries.filter(([name]) => !name.endsWith('/page')).flatMap(([, files]) => files))
// Count the new Settings layout as route-specific too. Excluding it would move
// bytes across the accounting boundary and overstate the reduction vs master.
const dashboardShared = new Set(entries.filter(([name]) => !name.endsWith('/page') && !name.includes('/admin/settings/')).flatMap(([, files]) => files))
const all = [...new Set(entries.flatMap(([, files]) => files))]
const measure = (file) => {
  const source = readFileSync(`.next/${file}`)
  return { file: `/_next/${file}`, raw: source.length, gzip: gzipSync(source).length }
}
const sum = (rows) => ({ raw: rows.reduce((total, row) => total + row.raw, 0), gzip: rows.reduce((total, row) => total + row.gzip, 0) })
const chunks = all.map(measure)
const pageOnly = all.filter((file) => !shared.has(file)).map(measure)
const routeSpecific = all.filter((file) => !dashboardShared.has(file)).map(measure)
const report = {
  git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: label === 'after' ? 'Environment-only implementation working tree, based on git above' : 'Merged master',
  builtAt: new Date().toISOString(), next: JSON.parse(readFileSync('node_modules/next/package.json')).version,
  node: process.version, route, chunks, totals: sum(chunks), pageOnly, pageOnlyTotals: sum(pageOnly), routeSpecific, routeSpecificTotals: sum(routeSpecific),
  measurement: 'Static production client-reference manifest, unique referenced JS chunks gzip-compressed independently; excludes common root runtime, CSS, HTML/RSC, browser transfer and hydration CPU.',
}
writeFileSync(`docs/performance/env-only-${label}.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ route, totals: report.totals, pageOnlyTotals: report.pageOnlyTotals }))

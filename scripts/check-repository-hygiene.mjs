#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'

export const forbiddenPathPatterns = [
  /^graphify-out\//,
  /(^|\/)\.graphify_/,
  /(^|\/)(desktop\.ini|\.DS_Store)$/i,
  /^\.claude\/settings\.local\.json$/i,
  /(^|\/)(coverage|playwright-report|test-results?|\.next|cache|output)\//i,
]
export const machinePathPattern = /(?:[A-Za-z]:[\\/](?:Users|home)[\\/]|\/(?:Users|home)\/)/i

export function findRepositoryHygieneViolations(trackedFiles, readFile) {
  const violations = []
  for (const filePath of trackedFiles) {
    if (forbiddenPathPatterns.some((pattern) => pattern.test(filePath)) || machinePathPattern.test(filePath)) {
      violations.push(`${filePath} (prohibited tracked path)`)
      continue
    }

    let content
    try {
      content = readFile(filePath)
    } catch {
      continue
    }
    if (content.includes('\0')) continue
    if (machinePathPattern.test(content)) {
      violations.push(`${filePath} (contains a machine-specific absolute path)`)
    }
  }
  return violations
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const pathViolations = trackedFiles
  .filter((filePath) => forbiddenPathPatterns.some((pattern) => pattern.test(filePath)) || machinePathPattern.test(filePath))
  .map((filePath) => `${filePath} (prohibited tracked path)`)

const grepResult = spawnSync(
  'git',
  ['grep', '-I', '-l', '-E', machinePathPattern.source, 'HEAD', '--'],
  { encoding: 'utf8' }
)
if (grepResult.error || ![0, 1].includes(grepResult.status ?? 1)) {
  throw grepResult.error || new Error('Unable to inspect tracked file contents for repository hygiene.')
}

const contentViolations = (grepResult.stdout || '')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((entry) => entry.replace(/^HEAD:/, ''))
  .filter((filePath) => !pathViolations.some((violation) => violation.startsWith(`${filePath} (`)))
  .map((filePath) => `${filePath} (contains a machine-specific absolute path)`)

const violations = [...pathViolations, ...contentViolations]

if (violations.length > 0) {
  console.error('Repository hygiene check failed. Remove generated or machine-specific paths:')
  violations.forEach((filePath) => console.error(`- ${filePath}`))
  process.exitCode = 1
} else {
  console.log('Repository hygiene check passed.')
}

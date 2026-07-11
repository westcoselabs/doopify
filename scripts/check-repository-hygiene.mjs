#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

const forbiddenPathPatterns = [
  /^graphify-out\//,
  /(^|\/)\.graphify_/,
]
const machinePathPattern = /(?:^[A-Za-z]:[\\/](?:Users|home)[\\/]|^\/(?:Users|home)\/)/i

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const violations = trackedFiles.filter(
  (filePath) => forbiddenPathPatterns.some((pattern) => pattern.test(filePath)) || machinePathPattern.test(filePath)
)

if (violations.length > 0) {
  console.error('Repository hygiene check failed. Remove generated or machine-specific paths:')
  violations.forEach((filePath) => console.error(`- ${filePath}`))
  process.exitCode = 1
} else {
  console.log('Repository hygiene check passed.')
}

import 'server-only'

import { parseEnvironment } from './env-schema'

export { envSchema, parseEnvironment, type Environment } from './env-schema'

export const env = parseEnvironment(process.env)

/** Only developer-declared outbound secret references may use dynamic names. */
export function getEnvironmentSecret(name: `OUTBOUND_WEBHOOK_${string}`): string | undefined {
  if (!/^OUTBOUND_WEBHOOK_[A-Z0-9_]+$/.test(name)) throw new Error('Invalid outbound webhook environment variable name')
  // Signing-key bytes must survive migration exactly, including whitespace.
  return process.env[name] || undefined
}

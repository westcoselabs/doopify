export function legacySessionCompatibilityAllowed(
  cutoffValue = process.env.SESSION_LEGACY_TOKEN_CUTOFF,
  now = Date.now()
) {
  if (!cutoffValue) return false
  const cutoff = new Date(cutoffValue)
  return Number.isFinite(cutoff.getTime()) && now < cutoff.getTime()
}

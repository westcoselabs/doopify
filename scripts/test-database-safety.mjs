const DEFAULT_POSTGRES_PORT = '5432'

function normalizePostgresTarget(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null
    const schemas = url.searchParams.getAll('schema')
    if (schemas.length > 1 || schemas.some((schema) => !schema.trim())) return null

    const target = {
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port || DEFAULT_POSTGRES_PORT,
      username: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      schema: schemas[0] || 'public',
    }

    return target.hostname && target.username && target.database ? target : null
  } catch {
    return null
  }
}

export function redactedTarget(target) {
  if (!target) return 'unavailable target'
  return `protocol=${target.protocol.replace(':', '')} host=${target.hostname} port=${target.port} user=${target.username} database=${target.database} schema=${target.schema}`
}

export function targetsMatch(left, right) {
  return Boolean(left && right) && ['protocol', 'hostname', 'port', 'username', 'database', 'schema'].every((field) => left[field] === right[field])
}

export function evaluateTestDatabaseResetSafety({
  databaseUrlTest,
  e2eDatabaseUrl,
  databaseUrl,
  publicSchemaAcknowledged = false,
}) {
  const testTarget = normalizePostgresTarget(databaseUrlTest)
  if (!testTarget) {
    return { ok: false, reason: 'DATABASE_URL_TEST is missing, malformed, or ambiguous.' }
  }

  const normalTarget = String(databaseUrl || '').trim() ? normalizePostgresTarget(databaseUrl) : null
  if (String(databaseUrl || '').trim() && !normalTarget) {
    return { ok: false, reason: 'DATABASE_URL is malformed; refusing to classify the test target as disposable.' }
  }
  if (normalTarget && targetsMatch(testTarget, normalTarget)) {
    return { ok: false, reason: `DATABASE_URL_TEST matches DATABASE_URL (${redactedTarget(testTarget)}).` }
  }

  if (testTarget.schema !== 'public') {
    return { ok: true, target: testTarget, allowPublicSchemaReset: false }
  }

  const e2eTarget = normalizePostgresTarget(e2eDatabaseUrl)
  if (!e2eTarget) {
    return { ok: false, reason: 'Public-schema reset requires a valid E2E_DATABASE_URL for the same disposable target.' }
  }
  if (!targetsMatch(testTarget, e2eTarget)) {
    return {
      ok: false,
      reason: `DATABASE_URL_TEST and E2E_DATABASE_URL differ (${redactedTarget(testTarget)}; E2E ${redactedTarget(e2eTarget)}).`,
    }
  }
  if (!publicSchemaAcknowledged) {
    return { ok: false, reason: 'Public-schema reset requires DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA=1.' }
  }

  return { ok: true, target: testTarget, allowPublicSchemaReset: true }
}

export function schemaFromTestDatabaseUrl(databaseUrlTest) {
  return normalizePostgresTarget(databaseUrlTest)?.schema || null
}

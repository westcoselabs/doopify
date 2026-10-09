import 'server-only'
import { env } from '@/lib/env'
import { getEnvironmentIntegrationStatuses, type IntegrationId, type IntegrationStatus } from '@/lib/env-schema'
export { integrationIds, type IntegrationId, type IntegrationStatus } from '@/lib/env-schema'

export type IntegrationDiagnostic = { id: IntegrationId; ok: boolean; checkedAt: string; error: string | null }

/** Presence is configuration, never a claim that a provider is reachable. */
export function getIntegrationStatuses(): IntegrationStatus[] {
  return getEnvironmentIntegrationStatuses(env)
}

/** Explicit, bounded, read-only diagnostics. No provider response body is exposed. */
export async function testIntegration(id: IntegrationId): Promise<IntegrationDiagnostic> {
  const checkedAt = new Date().toISOString()
  const status = getIntegrationStatuses().find((entry) => entry.id === id)
  if (!status?.configured) return { id, ok: false, checkedAt, error: `Missing environment variables: ${status?.missing.join(', ') || 'unknown provider'}` }
  try {
    if (id === 'stripe' || id === 'resend') {
      const url = id === 'stripe' ? 'https://api.stripe.com/v1/account' : 'https://api.resend.com/domains?limit=1'
      const key = id === 'stripe' ? env.STRIPE_SECRET_KEY : env.RESEND_API_KEY
      const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000), cache: 'no-store' })
      await response.body?.cancel()
      if (!response.ok) return { id, ok: false, checkedAt, error: `Provider check returned HTTP ${response.status}.` }
    } else if (id === 'smtp') {
      const { getSmtpTransport } = await import('@/server/email/provider')
      await getSmtpTransport().verify()
    } else if (id === 'shippo' || id === 'easypost') {
      const { testShippingProviderConnection } = await import('@/server/shipping/shipping-provider.service')
      const result = await testShippingProviderConnection(id === 'shippo' ? 'SHIPPO' : 'EASYPOST')
      if (!result.ok) return { id, ok: false, checkedAt, error: 'Provider connection failed. Check credentials and provider availability.' }
    } else {
      return { id, ok: false, checkedAt, error: 'Connection testing is unavailable for this integration. Review its operational logs.' }
    }
    return { id, ok: true, checkedAt, error: null }
  } catch {
    return { id, ok: false, checkedAt, error: 'Connection check failed or timed out. Check credentials and provider availability.' }
  }
}

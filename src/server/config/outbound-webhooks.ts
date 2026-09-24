import type { DoopifyEventName } from '@/server/events/types'

export type OutboundDestination = {
  /** Keep this ID stable across URL/name changes and migration. */
  id: string
  name: string
  url: string
  events: readonly DoopifyEventName[]
  secretEnv: `OUTBOUND_WEBHOOK_${string}`
  headers?: Readonly<Record<string, `OUTBOUND_WEBHOOK_${string}`>>
}

/** Developer-owned subscriptions. Secrets belong only in deployment env.
 * Keep retired destinations with events: [] until pending deliveries are drained.
 * Existing stores: import the preflight export to retain IDs and signing keys.
 */
export const outboundDestinations: readonly OutboundDestination[] = []

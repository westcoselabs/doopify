import { ok } from '@/lib/api'
import { getStripePublicConfig } from '@/lib/stripe-client'

export const runtime = 'nodejs'

export async function GET() {
  return ok(getStripePublicConfig())
}

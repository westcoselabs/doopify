import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { dollarsToCents } from '@/lib/money'
import { serializeShippingSettings } from '@/server/shipping/shipping-settings.dto'
import { requireAdmin } from '@/server/auth/require-auth'
import { auditActorFromUser, recordAuditLogBestEffort } from '@/server/services/audit-log.service'
import {
  getShippingSettingsStore,
  updateShippingSettings,
} from '@/server/shipping/shipping-settings.service'

const updateShippingSettingsSchema = z.object({
  shippingMode: z.enum(['MANUAL', 'LIVE_RATES', 'HYBRID']).optional(),
  fallbackBehavior: z.enum(['SHOW_FALLBACK', 'HIDE_SHIPPING', 'MANUAL_QUOTE']).optional(),
  shippingThreshold: z.number().min(0).nullable().optional(),
  shippingDomesticRate: z.number().min(0).optional(),
  shippingInternationalRate: z.number().min(0).optional(),
  manualFulfillmentInstructions: z.string().trim().max(500).nullable().optional(),
  manualTrackingBehavior: z.string().trim().max(160).nullable().optional(),
  localDeliveryEnabled: z.boolean().optional(),
  localDeliveryPrice: z.number().min(0).nullable().optional(),
  localDeliveryMinimumOrder: z.number().min(0).nullable().optional(),
  localDeliveryCoverage: z.string().trim().max(500).nullable().optional(),
  localDeliveryInstructions: z.string().trim().max(500).nullable().optional(),
  pickupEnabled: z.boolean().optional(),
  pickupLocation: z.string().trim().max(200).nullable().optional(),
  pickupInstructions: z.string().trim().max(500).nullable().optional(),
  pickupEstimate: z.string().trim().max(160).nullable().optional(),
  packingSlipUseLogo: z.boolean().optional(),
  packingSlipShowSku: z.boolean().optional(),
  packingSlipShowProductImages: z.boolean().optional(),
  packingSlipFooterNote: z.string().trim().max(500).nullable().optional(),
}).strict()

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const store = await getShippingSettingsStore()
    if (!store) return err('Store not configured', 404)

    return ok(serializeShippingSettings(store))
  } catch (error) {
    console.error('[GET /api/settings/shipping]', error)
    return err('Failed to load shipping settings', 500)
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = updateShippingSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Shipping settings payload is invalid', parsed.error.flatten())
  }

  try {
    const store = await getShippingSettingsStore()
    if (!store) return err('Store not configured', 404)

    const updated = await updateShippingSettings(store.id, {
      ...(parsed.data.shippingMode !== undefined ? { shippingMode: parsed.data.shippingMode } : {}),
      ...(parsed.data.fallbackBehavior !== undefined ? { fallbackBehavior: parsed.data.fallbackBehavior } : {}),
      ...(parsed.data.shippingThreshold !== undefined
        ? {
            shippingThresholdCents:
              parsed.data.shippingThreshold == null ? null : dollarsToCents(parsed.data.shippingThreshold),
          }
        : {}),
      ...(parsed.data.shippingDomesticRate !== undefined
        ? {
            shippingDomesticRateCents: dollarsToCents(parsed.data.shippingDomesticRate),
          }
        : {}),
      ...(parsed.data.shippingInternationalRate !== undefined
        ? {
            shippingInternationalRateCents: dollarsToCents(parsed.data.shippingInternationalRate),
          }
        : {}),
      ...(parsed.data.manualFulfillmentInstructions !== undefined
        ? { manualFulfillmentInstructions: parsed.data.manualFulfillmentInstructions?.trim() || null }
        : {}),
      ...(parsed.data.manualTrackingBehavior !== undefined
        ? { manualTrackingBehavior: parsed.data.manualTrackingBehavior?.trim() || null }
        : {}),
      ...(parsed.data.localDeliveryEnabled !== undefined
        ? { localDeliveryEnabled: parsed.data.localDeliveryEnabled }
        : {}),
      ...(parsed.data.localDeliveryPrice !== undefined
        ? {
            localDeliveryPriceCents:
              parsed.data.localDeliveryPrice == null ? null : dollarsToCents(parsed.data.localDeliveryPrice),
          }
        : {}),
      ...(parsed.data.localDeliveryMinimumOrder !== undefined
        ? {
            localDeliveryMinimumOrderCents:
              parsed.data.localDeliveryMinimumOrder == null
                ? null
                : dollarsToCents(parsed.data.localDeliveryMinimumOrder),
          }
        : {}),
      ...(parsed.data.localDeliveryCoverage !== undefined
        ? { localDeliveryCoverage: parsed.data.localDeliveryCoverage?.trim() || null }
        : {}),
      ...(parsed.data.localDeliveryInstructions !== undefined
        ? { localDeliveryInstructions: parsed.data.localDeliveryInstructions?.trim() || null }
        : {}),
      ...(parsed.data.pickupEnabled !== undefined ? { pickupEnabled: parsed.data.pickupEnabled } : {}),
      ...(parsed.data.pickupLocation !== undefined
        ? { pickupLocation: parsed.data.pickupLocation?.trim() || null }
        : {}),
      ...(parsed.data.pickupInstructions !== undefined
        ? { pickupInstructions: parsed.data.pickupInstructions?.trim() || null }
        : {}),
      ...(parsed.data.pickupEstimate !== undefined
        ? { pickupEstimate: parsed.data.pickupEstimate?.trim() || null }
        : {}),
      ...(parsed.data.packingSlipUseLogo !== undefined
        ? { packingSlipUseLogo: parsed.data.packingSlipUseLogo }
        : {}),
      ...(parsed.data.packingSlipShowSku !== undefined
        ? { packingSlipShowSku: parsed.data.packingSlipShowSku }
        : {}),
      ...(parsed.data.packingSlipShowProductImages !== undefined
        ? { packingSlipShowProductImages: parsed.data.packingSlipShowProductImages }
        : {}),
      ...(parsed.data.packingSlipFooterNote !== undefined
        ? { packingSlipFooterNote: parsed.data.packingSlipFooterNote?.trim() || null }
        : {}),
    })

    await recordAuditLogBestEffort({
      action: 'shipping.settings_updated',
      actor: auditActorFromUser(auth.user),
      resource: { type: 'Store', id: store.id },
      summary: `Shipping settings updated by ${auth.user.email}`,
      snapshot: {
        storeId: store.id,
        updatedFields: Object.keys(parsed.data).sort(),
        shippingMode: updated.shippingMode,
        fallbackBehavior: updated.fallbackBehavior,
      },
    })

    return ok(serializeShippingSettings(updated))
  } catch (error) {
    console.error('[PATCH /api/settings/shipping]', error)
    const message = error instanceof Error ? error.message : 'Failed to update shipping settings'
    return err(message, 400)
  }
}

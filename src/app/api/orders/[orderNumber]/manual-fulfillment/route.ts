import { z } from 'zod'

import { err, ok, parseBody, unprocessable } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/auth/require-auth'
import { isTransactionalEmailConfigured } from '@/server/email/provider'
import { auditActorFromUser, recordAuditLogBestEffort } from '@/server/services/audit-log.service'
import { createManualFulfillment } from '@/server/services/order.service'

interface Params {
  params: Promise<{ orderNumber: string }>
}

const schema = z.object({
  carrier: z.string().trim().max(120).optional(),
  service: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
  trackingUrl: z.string().trim().url().max(500).optional(),
  shippedDate: z.string().datetime().optional(),
  sendTrackingEmail: z.boolean().optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        variantId: z.string().min(1).optional(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1, 'At least one item is required'),
})

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { orderNumber } = await params
  const parsedOrderNumber = Number.parseInt(orderNumber, 10)
  if (!Number.isFinite(parsedOrderNumber) || parsedOrderNumber <= 0) {
    return err('Invalid order number', 400)
  }

  const body = await parseBody(req)
  if (!body) return err('Invalid request body', 400)

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return unprocessable('Manual fulfillment payload is invalid', parsed.error.flatten())
  }

  const order = await prisma.order.findUnique({
    where: {
      orderNumber: parsedOrderNumber,
    },
    select: {
      id: true,
      email: true,
    },
  })

  if (!order) {
    return err('Order not found', 404)
  }

  try {
    const trackingEmailRequested = Boolean(parsed.data.sendTrackingEmail)
    const hasCustomerEmail = Boolean(order.email)
    const emailProviderConfigured = isTransactionalEmailConfigured()
    const queueTrackingEmail =
      trackingEmailRequested && hasCustomerEmail && emailProviderConfigured

    const fulfillment = await createManualFulfillment({
      orderId: order.id,
      items: parsed.data.items,
      carrier: parsed.data.carrier,
      service: parsed.data.service,
      trackingNumber: parsed.data.trackingNumber,
      trackingUrl: parsed.data.trackingUrl,
      shippedAt: parsed.data.shippedDate ? new Date(parsed.data.shippedDate) : undefined,
      sendTrackingEmail: queueTrackingEmail,
    })

    await recordAuditLogBestEffort({
      action: 'fulfillment.manual_created',
      actor: auditActorFromUser(auth.user),
      resource: { type: 'Order', id: order.id },
      summary: `Manual fulfillment created for order #${parsedOrderNumber}`,
      snapshot: {
        orderId: order.id,
        orderNumber: parsedOrderNumber,
        fulfillmentId: fulfillment.id,
        itemCount: parsed.data.items.length,
        sendTrackingEmail: Boolean(parsed.data.sendTrackingEmail),
        trackingNumberPresent: Boolean(parsed.data.trackingNumber),
      },
      redactions: ['trackingNumber', 'trackingUrl'],
    })

    return ok(
      {
        fulfillment,
        trackingEmail: {
          requested: trackingEmailRequested,
          queued: queueTrackingEmail,
          skippedReason: queueTrackingEmail
            ? null
            : trackingEmailRequested
              ? !hasCustomerEmail
                ? 'MISSING_CUSTOMER_EMAIL'
                : 'EMAIL_PROVIDER_NOT_CONFIGURED'
              : 'NOT_REQUESTED',
        },
      },
      201
    )
  } catch (error) {
    console.error('[POST /api/orders/[orderNumber]/manual-fulfillment]', error)
    const message = error instanceof Error ? error.message : 'Failed to create manual fulfillment'
    return err(message, 400)
  }
}

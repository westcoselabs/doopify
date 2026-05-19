import { prisma } from '@/lib/prisma'
import { sendTrackedEmail } from '@/server/services/email-delivery.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

function normalizeNote(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

type UpdateOrderNotesInput = {
  orderId: string
  internalNote?: string | null
  customerNote?: string | null
  sendCustomerEmail?: boolean
}

export async function updateOrderNotes(input: UpdateOrderNotesInput) {
  const hasInternalNoteUpdate = Object.prototype.hasOwnProperty.call(input, 'internalNote')
  const hasCustomerNoteUpdate = Object.prototype.hasOwnProperty.call(input, 'customerNote')
  const normalizedInternalNote = normalizeNote(input.internalNote)
  const normalizedCustomerNote = normalizeNote(input.customerNote)
  const shouldSendCustomerEmail = Boolean(input.sendCustomerEmail)

  if (!hasInternalNoteUpdate && !hasCustomerNoteUpdate) {
    throw new Error('No note updates were provided')
  }

  if (shouldSendCustomerEmail && !normalizedCustomerNote) {
    throw new Error('A customer-visible note is required before sending an email')
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      email: true,
      note: true,
    },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  if (shouldSendCustomerEmail && !order.email) {
    throw new Error('Order does not have a customer email address')
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    let nextOrder = order

    if (hasInternalNoteUpdate && normalizedInternalNote !== order.note) {
      nextOrder = await tx.order.update({
        where: { id: input.orderId },
        data: { note: normalizedInternalNote },
        select: {
          id: true,
          orderNumber: true,
          email: true,
          note: true,
        },
      })

      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: 'ORDER_NOTE_UPDATED',
          title: normalizedInternalNote ? 'Internal note updated' : 'Internal note cleared',
          detail: normalizedInternalNote ?? undefined,
          actorType: 'STAFF',
        },
      })
    }

    if (hasCustomerNoteUpdate && normalizedCustomerNote) {
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: 'CUSTOMER_NOTE_ADDED',
          title: 'Customer-visible note added',
          detail: normalizedCustomerNote,
          actorType: 'STAFF',
        },
      })
    }

    return nextOrder
  })

  let emailDelivery: { attempted: boolean; sent: boolean; error: string | null } = {
    attempted: false,
    sent: false,
    error: null,
  }

  if (shouldSendCustomerEmail && normalizedCustomerNote && order.email) {
    emailDelivery = { attempted: true, sent: false, error: null }
    try {
      const store = await getStoreSettingsLite()
      const storeName = store?.name || 'Doopify'
      const from = store?.email || 'orders@doopify.local'
      const subject = `${storeName} update for order #${order.orderNumber}`
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
          <h1 style="font-size:24px;line-height:1.3;margin:0 0 12px;">Order update</h1>
          <p style="margin:0 0 16px;color:#374151;">Order <strong>#${escapeHtml(order.orderNumber)}</strong></p>
          <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
            ${escapeHtml(normalizedCustomerNote).replaceAll('\n', '<br />')}
          </div>
        </div>
      `

      await sendTrackedEmail({
        event: 'order.note_sent',
        template: 'order_note',
        recipientEmail: order.email,
        subject,
        from,
        html,
        orderId: order.id,
      })
      emailDelivery.sent = true
    } catch (error) {
      emailDelivery.error = error instanceof Error ? error.message : 'Failed to send note email'
    }
  }

  return {
    order: updatedOrder,
    emailDelivery,
  }
}

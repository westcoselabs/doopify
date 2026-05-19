import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getStoreSettingsLite: vi.fn(),
  sendTrackedEmail: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/server/services/settings.service', () => ({
  getStoreSettingsLite: mocks.getStoreSettingsLite,
}))

vi.mock('@/server/services/email-delivery.service', () => ({
  sendTrackedEmail: mocks.sendTrackedEmail,
}))

import { updateOrderNotes } from './order-notes.service'

const baseOrder = {
  id: 'order_1',
  orderNumber: 1001,
  email: 'customer@example.com',
  note: null,
}

describe('updateOrderNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma)
    )
    mocks.prisma.order.findUnique.mockResolvedValue(baseOrder)
    mocks.prisma.order.update.mockResolvedValue({
      ...baseOrder,
      note: 'Internal note',
    })
    mocks.prisma.orderEvent.create.mockResolvedValue({})
    mocks.getStoreSettingsLite.mockResolvedValue({
      name: 'Doopify',
      email: 'orders@doopify.local',
    })
    mocks.sendTrackedEmail.mockResolvedValue({ id: 'email_1' })
  })

  it('updates internal note and writes an order event', async () => {
    const result = await updateOrderNotes({
      orderId: 'order_1',
      internalNote: 'Internal note',
    })

    expect(mocks.prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { note: 'Internal note' },
      select: {
        id: true,
        orderNumber: true,
        email: true,
        note: true,
      },
    })
    expect(mocks.prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          type: 'ORDER_NOTE_UPDATED',
          title: 'Internal note updated',
        }),
      })
    )
    expect(result.emailDelivery).toEqual({
      attempted: false,
      sent: false,
      error: null,
    })
  })

  it('adds customer-visible note and sends tracked email when requested', async () => {
    const result = await updateOrderNotes({
      orderId: 'order_1',
      customerNote: 'Your package is delayed by one day.',
      sendCustomerEmail: true,
    })

    expect(mocks.prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          type: 'CUSTOMER_NOTE_ADDED',
          title: 'Customer-visible note added',
          detail: 'Your package is delayed by one day.',
        }),
      })
    )
    expect(mocks.sendTrackedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'order.note_sent',
        template: 'order_note',
        recipientEmail: 'customer@example.com',
        orderId: 'order_1',
      })
    )
    expect(result.emailDelivery).toEqual({
      attempted: true,
      sent: true,
      error: null,
    })
  })

  it('records send failure without rolling back note writes', async () => {
    mocks.sendTrackedEmail.mockRejectedValueOnce(new Error('Provider unavailable'))

    const result = await updateOrderNotes({
      orderId: 'order_1',
      customerNote: 'We updated your shipment.',
      sendCustomerEmail: true,
    })

    expect(mocks.prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CUSTOMER_NOTE_ADDED',
        }),
      })
    )
    expect(result.emailDelivery).toEqual({
      attempted: true,
      sent: false,
      error: 'Provider unavailable',
    })
  })
})

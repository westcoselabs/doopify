import type { OrderConfirmationInput } from '@/server/services/email-template.service'
import type { Prisma } from '@prisma/client'
import { queueOrderConfirmationEmailDelivery } from '@/server/services/email-delivery.service'

export async function sendOrderConfirmationEmail(input: OrderConfirmationInput, client?: Prisma.TransactionClient) {
  if (!input.email || !input.orderId) {
    return
  }

  return queueOrderConfirmationEmailDelivery({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    email: input.email,
  }, client)
}

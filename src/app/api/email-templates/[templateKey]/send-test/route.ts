import { z } from 'zod'
import { ok, err, parseBody } from '@/lib/api'
import { requireAdmin } from '@/server/auth/require-auth'
import { sendTransactionalEmail } from '@/server/email/provider'
import { createEmailDelivery, markEmailDeliverySent, markEmailDeliveryFailed } from '@/server/services/email-delivery.service'
import {
  getEmailTemplateSetting,
  isEditableTemplateKey,
  renderTemplateVariables,
} from '@/server/services/email-template-settings.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'
import { buildOrderConfirmationTestHtml, buildFulfillmentTrackingTestHtml } from '@/server/services/email-template.service'

export const runtime = 'nodejs'

interface Params {
  params: Promise<{ templateKey: string }>
}

const sendTestSchema = z.object({
  recipientEmail: z.string().email(),
})

// Sample data used for test sends — never uses real orders/customers.
const SAMPLE_VARS: Record<string, string> = {
  orderNumber: 'DPY-TEST-001',
  customerName: 'Test Customer',
  trackingNumber: '1Z999AA10123456784',
  trackingUrl: 'https://example.com/track/1Z999AA10123456784',
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const { templateKey } = await params

  if (!isEditableTemplateKey(templateKey)) {
    return err('Template not found or not editable', 404)
  }

  const body = await parseBody(req)
  if (!body) return err('Invalid request body')

  const parsed = sendTestSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0].message)

  const { recipientEmail } = parsed.data

  try {
    const [setting, store] = await Promise.all([
      getEmailTemplateSetting(templateKey),
      getStoreSettingsLite(),
    ])

    const storeName = store?.name || 'Doopify Store'
    const from = store?.email || 'noreply@doopify.local'

    const vars = { ...SAMPLE_VARS, storeName }

    const subject = renderTemplateVariables(setting.fields.subject, vars)

    let html: string
    if (templateKey === 'order_confirmation') {
      html = buildOrderConfirmationTestHtml(setting.fields, storeName, store)
    } else {
      html = buildFulfillmentTrackingTestHtml(setting.fields, storeName, store)
    }

    // Record the delivery for observability before attempting send.
    const delivery = await createEmailDelivery({
      event: 'template_test',
      template: templateKey,
      recipientEmail,
      subject,
      provider: 'resend',
    })

    try {
      const result = await sendTransactionalEmail({ from, to: [recipientEmail], subject, html })

      await markEmailDeliverySent({
        deliveryId: delivery.id,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      })

      return ok({
        sent: true,
        provider: result.provider,
        recipientEmail,
        subject,
        deliveryId: delivery.id,
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Send failed'
      await markEmailDeliveryFailed({ deliveryId: delivery.id, error: message })

      return ok({
        sent: false,
        provider: 'preview',
        recipientEmail,
        subject,
        deliveryId: delivery.id,
        error: 'Email provider not configured or send failed. Check Settings → Email to connect a provider.',
      })
    }
  } catch (e) {
    console.error(`[POST /api/email-templates/${templateKey}/send-test]`, e)
    return err('Failed to send test email', 500)
  }
}

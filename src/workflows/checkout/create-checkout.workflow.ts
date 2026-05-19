import { createCheckoutPaymentIntent } from '@/server/services/checkout.service'
import { defineWorkflow } from '@/workflows/engine/define-workflow'
import type { WorkflowExecutionContext } from '@/workflows/engine/types'

export type CreateCheckoutWorkflowInput = Parameters<typeof createCheckoutPaymentIntent>[0]
export type CreateCheckoutWorkflowResult = Awaited<ReturnType<typeof createCheckoutPaymentIntent>>

export const createCheckoutWorkflow = defineWorkflow<
  CreateCheckoutWorkflowInput,
  CreateCheckoutWorkflowResult
>({
  id: 'checkout.create',
  name: 'Checkout Create',
  steps: [
    { id: 'validate_request_payload', description: 'Validate checkout create payload before running workflow.' },
    { id: 'load_live_cart_items', description: 'Load live variants from DB and validate stock availability.' },
    { id: 'calculate_pricing', description: 'Calculate authoritative totals using server-owned pricing service.' },
    { id: 'resolve_shipping_selection', description: 'Resolve and revalidate selected shipping quote.' },
    { id: 'create_or_update_checkout_session', description: 'Persist checkout session using current checkout service behavior.' },
    { id: 'create_payment_intent', description: 'Create Stripe PaymentIntent using current Stripe runtime selection.' },
    { id: 'emit_checkout_created_event', description: 'Emit checkout.created event when checkout session is created.' },
    { id: 'build_response', description: 'Return existing checkout response payload shape.' },
  ],
  async run(input, context) {
    context?.step?.('workflow.checkout_create.start')
    const result = await createCheckoutPaymentIntent(input)
    context?.step?.('workflow.checkout_create.complete')
    return result
  },
})

export async function runCreateCheckoutWorkflow(
  input: CreateCheckoutWorkflowInput,
  context?: WorkflowExecutionContext
) {
  return createCheckoutWorkflow.run(input, context)
}

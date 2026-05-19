import type { StripePaymentIntent } from '@/lib/stripe'
import { completeCheckoutFromPaymentIntent } from '@/server/services/checkout.service'
import { defineWorkflow } from '@/workflows/engine/define-workflow'
import type { WorkflowExecutionContext } from '@/workflows/engine/types'

export type FinalizePaidOrderWorkflowInput = {
  paymentIntent: StripePaymentIntent
}

export type FinalizePaidOrderWorkflowResult = Awaited<
  ReturnType<typeof completeCheckoutFromPaymentIntent>
>

export const finalizePaidOrderWorkflow = defineWorkflow<
  FinalizePaidOrderWorkflowInput,
  FinalizePaidOrderWorkflowResult
>({
  id: 'checkout.finalize_paid_order',
  name: 'Checkout Finalize Paid Order',
  steps: [
    {
      id: 'receive_verified_event_context',
      description: 'Receive verified payment intent context from existing webhook processing path.',
    },
    {
      id: 'preserve_idempotency_behavior',
      description: 'Preserve duplicate/idempotent finalization behavior owned by checkout service.',
    },
    {
      id: 'finalize_checkout_order',
      description: 'Finalize paid order using existing completeCheckoutFromPaymentIntent behavior.',
    },
    {
      id: 'return_existing_result',
      description: 'Return the existing finalization result without response-shape changes.',
    },
  ],
  async run(input, context) {
    context?.step?.('workflow.finalize_paid_order.start')
    const result = await completeCheckoutFromPaymentIntent(input.paymentIntent)
    context?.step?.('workflow.finalize_paid_order.complete')
    return result
  },
})

export async function runFinalizePaidOrderWorkflow(
  input: FinalizePaidOrderWorkflowInput,
  context?: WorkflowExecutionContext
) {
  return finalizePaidOrderWorkflow.run(input, context)
}

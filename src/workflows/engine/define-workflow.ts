import type { WorkflowDefinition, WorkflowExecutionContext, WorkflowStepDefinition } from './types'

type DefineWorkflowInput<TInput, TOutput> = {
  id: string
  name: string
  steps: WorkflowStepDefinition[]
  run: (input: TInput, context?: WorkflowExecutionContext) => Promise<TOutput>
}

export function defineWorkflow<TInput, TOutput>(
  input: DefineWorkflowInput<TInput, TOutput>
): WorkflowDefinition<TInput, TOutput> {
  return {
    id: input.id,
    name: input.name,
    steps: input.steps,
    run: input.run,
  }
}

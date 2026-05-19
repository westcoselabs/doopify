export type WorkflowStepDefinition = {
  id: string
  description: string
}

export type WorkflowExecutionContext = {
  step?: (name: string) => void
}

export type WorkflowDefinition<TInput, TOutput> = {
  id: string
  name: string
  steps: WorkflowStepDefinition[]
  run: (input: TInput, context?: WorkflowExecutionContext) => Promise<TOutput>
}

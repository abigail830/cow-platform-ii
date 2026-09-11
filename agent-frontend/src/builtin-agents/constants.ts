import type { BuiltinWorkflowKey } from '../api/builtinAgents.ts';

export const BUILTIN_WORKFLOW_LABELS: Record<BuiltinWorkflowKey, string> = {
  faq_polish: 'FAQ polish',
};

export const BUILTIN_WORKFLOW_KEYS = Object.keys(
  BUILTIN_WORKFLOW_LABELS,
) as BuiltinWorkflowKey[];

export const BUILTIN_SAMPLE_VARIABLES: Record<BuiltinWorkflowKey, Record<string, string>> = {
  faq_polish: {
    question: 'What is the delivery timeline?',
    answer: 'about 8 weeks maybe',
  },
};

export function defaultOutputMode(_workflowKey: BuiltinWorkflowKey): string {
  return 'text';
}

import type { BuiltinWorkflowKey } from '../api/builtinAgents.ts';

export const BUILTIN_WORKFLOW_LABELS: Record<BuiltinWorkflowKey, string> = {
  session_image_extract: 'Session image extract',
  metadata_extract: 'Metadata extract',
  faq_extract: 'FAQ extract',
  faq_polish: 'FAQ polish',
};

export const BUILTIN_WORKFLOW_KEYS = Object.keys(
  BUILTIN_WORKFLOW_LABELS,
) as BuiltinWorkflowKey[];

export const BUILTIN_SAMPLE_VARIABLES: Record<BuiltinWorkflowKey, Record<string, string>> = {
  session_image_extract: { filename: 'sample.png' },
  metadata_extract: {
    markdown: '# Sample document\n\nAuthor: Jane Doe\nPublished: 2024-01-15',
  },
  faq_extract: {
    document_name: 'Sample proposal',
    markdown: '## Scope\nWe deliver analytics dashboards within 8 weeks.',
  },
  faq_polish: {
    question: 'What is the delivery timeline?',
    answer: 'about 8 weeks maybe',
  },
};

export function defaultOutputMode(workflowKey: BuiltinWorkflowKey): string {
  if (workflowKey === 'faq_extract') return 'json';
  if (workflowKey === 'metadata_extract') return 'structured';
  return 'text';
}

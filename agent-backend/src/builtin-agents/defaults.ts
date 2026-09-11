import type { BuiltinWorkflowKey } from '../infrastructure/db/schema.ts';

export type BuiltinAgentSeed = {
  slug: string;
  name: string;
  description: string;
  workflowKey: BuiltinWorkflowKey;
  apiType: 'chat-completions' | 'vlm';
  systemPrompt: string;
  userPromptTemplate: string;
  outputMode: 'text' | 'json' | 'structured';
  outputSchema?: Record<string, unknown>;
  temperature?: string;
};

/** Production sync agents — FAQ extract and document metadata use pipeline Config YAML instead. */
export const BUILTIN_AGENT_SEEDS: BuiltinAgentSeed[] = [
  {
    slug: 'default-faq-polish',
    name: 'FAQ answer polish',
    description: 'Polish FAQ answers for clarity and professionalism.',
    workflowKey: 'faq_polish',
    apiType: 'chat-completions',
    systemPrompt: '',
    userPromptTemplate:
      'Polish the following FAQ answer for clarity and professionalism. Keep the same language as the input. Return only the polished answer text.\n\nQuestion: {question}\n\nAnswer: {answer}',
    outputMode: 'text',
    temperature: '0.2',
  },
];

export const WORKFLOW_VARIABLES: Record<BuiltinWorkflowKey, string[]> = {
  faq_polish: ['question', 'answer'],
};

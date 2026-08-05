import type { BuiltinWorkflowKey } from '../db/schema.ts';

export const DEFAULT_METADATA_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    abstract: {
      type: 'string',
      description: "One-sentence summary of the document's main content",
    },
    author: { type: 'string', description: 'Primary author name' },
    publish_date: { type: 'string', format: 'date', description: 'Publication date in YYYY-MM-DD format' },
    source: { type: 'string', description: 'Journal, conference, or publisher name' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Keywords or tags' },
    categories: { type: 'array', items: { type: 'string' }, description: 'Subject categories' },
  },
  required: [],
};

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

export const BUILTIN_AGENT_SEEDS: BuiltinAgentSeed[] = [
  {
    slug: 'default-session-image-extract',
    name: 'Session image extract',
    description: 'Extract visible text and visual summary from uploaded session images.',
    workflowKey: 'session_image_extract',
    apiType: 'vlm',
    systemPrompt: '',
    userPromptTemplate: `You are extracting content from an uploaded image attachment for a Q&A assistant.

Output Markdown using EXACTLY this structure (keep the headings):

# Image extract: {filename}

## Visible text
(Transcribe all legible text in reading order. Preserve original language. Use markdown tables when appropriate. Write [illegible] for unreadable fragments. If there is no text, write "None".)

## Visual summary
(Brief layout / chart / UI description in Chinese when helpful. Do not invent content that is not visible.)

## Uncertainties
(List ambiguous or cut-off regions; write "None" if nothing uncertain.)

Rules:
- Copy numbers, dates, and identifiers exactly as shown.
- Do not guess or hallucinate text.
- Do not wrap the response in code fences.`,
    outputMode: 'text',
    temperature: '0.1',
  },
  {
    slug: 'default-metadata-extract',
    name: 'Document metadata extract',
    description: 'Structured metadata extraction from document markdown.',
    workflowKey: 'metadata_extract',
    apiType: 'chat-completions',
    systemPrompt: 'Extract metadata from the document content. Use null for unknown values.',
    userPromptTemplate:
      'Document:\n---\n{markdown}\n---\n\nExtract metadata from the above document.',
    outputMode: 'structured',
    outputSchema: DEFAULT_METADATA_OUTPUT_SCHEMA,
    temperature: '0.2',
  },
  {
    slug: 'default-faq-extract',
    name: 'FAQ extract',
    description:
      'Prompt playground for FAQ extract. Production Extract from documents uses Admin → Pipelines → kb-faq-extract Config YAML.',
    workflowKey: 'faq_extract',
    apiType: 'chat-completions',
    systemPrompt: 'You extract FAQ pairs from documents. Respond with valid JSON only.',
    userPromptTemplate:
      'Extract FAQ question-and-answer pairs from the document markdown below. The source may be a proposal, report, or manual — infer useful Q&A a reader might ask (scope, pricing, timeline, deliverables, requirements). Return a JSON array of objects with "question" and "answer" fields. Include at least 3 pairs when the document has enough substance.\n\nDocument: {document_name}\n\n{markdown}',
    outputMode: 'json',
    temperature: '0.2',
  },
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
  session_image_extract: ['filename'],
  metadata_extract: ['markdown'],
  faq_extract: ['document_name', 'markdown'],
  faq_polish: ['question', 'answer'],
};

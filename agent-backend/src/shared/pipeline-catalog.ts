/** Built-in knowledge-base pipeline bindings and UI metadata. */

import type { KnowledgeBaseType } from '../db/index.ts';

export const PAGE_INDEX_KB_PIPELINE_NAME = 'kb-pageindex-import';
export const RAG_KB_PIPELINE_NAME = 'kb-rag-index';

export const KB_DEFAULT_PIPELINE_BY_TYPE: Record<KnowledgeBaseType, string | null> = {
  page_index: PAGE_INDEX_KB_PIPELINE_NAME,
  rag: RAG_KB_PIPELINE_NAME,
};

export type KbPipelineUiMeta = {
  category: 'knowledge' | 'document';
  boundTo: string;
};

export const KB_PIPELINE_UI_META: Record<string, KbPipelineUiMeta> = {
  [PAGE_INDEX_KB_PIPELINE_NAME]: {
    category: 'knowledge',
    boundTo: 'KnowledgeBase (type: page_index)',
  },
  [RAG_KB_PIPELINE_NAME]: {
    category: 'knowledge',
    boundTo: 'KnowledgeBase (type: rag)',
  },
};

export function kbPipelineUiMeta(pipelineName: string): KbPipelineUiMeta | null {
  return KB_PIPELINE_UI_META[pipelineName] ?? null;
}

export const DEFAULT_KB_PAGEINDEX_IMPORT_COMMAND_TEMPLATE =
  'openkms-cli kb pageindex-import --job-id {job_id}';

export const DEFAULT_KB_PAGEINDEX_IMPORT_WORKFLOW_FILE = 'openkms-kb-pageindex-import.yml';

export const DEFAULT_KB_RAG_INDEX_COMMAND_TEMPLATE =
  'openkms-cli kb rag-index --job-id {job_id}';

export const DEFAULT_KB_RAG_INDEX_WORKFLOW_FILE = 'openkms-kb-rag-index.yml';

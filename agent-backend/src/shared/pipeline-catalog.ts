/** Built-in knowledge-base pipeline bindings and UI metadata. */

import type { KnowledgeBaseType } from '../db/index.ts';

export const PAGE_INDEX_KB_PIPELINE_NAME = 'kb-pageindex-import';
export const RAG_KB_PIPELINE_NAME = 'kb-rag-index';
export const FAQ_KB_INDEX_PIPELINE_NAME = 'kb-faq-index';
export const FAQ_KB_EXTRACT_PIPELINE_NAME = 'kb-faq-extract';
export const METADATA_EXTRACT_PIPELINE_NAME = 'metadata-extract';

/** Map KB import job_kind → system pipeline_name (dispatch / fallback). */
export const KB_IMPORT_JOB_KIND_TO_PIPELINE: Partial<Record<string, string>> = {
  page_index_import: PAGE_INDEX_KB_PIPELINE_NAME,
  rag_index: RAG_KB_PIPELINE_NAME,
  faq_index: FAQ_KB_INDEX_PIPELINE_NAME,
  faq_extract: FAQ_KB_EXTRACT_PIPELINE_NAME,
};

export const KB_DEFAULT_PIPELINE_BY_TYPE: Record<KnowledgeBaseType, string | null> = {
  page_index: PAGE_INDEX_KB_PIPELINE_NAME,
  rag: RAG_KB_PIPELINE_NAME,
  faq: FAQ_KB_INDEX_PIPELINE_NAME,
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
  [FAQ_KB_INDEX_PIPELINE_NAME]: {
    category: 'knowledge',
    boundTo: 'KnowledgeBase (type: faq)',
  },
  [FAQ_KB_EXTRACT_PIPELINE_NAME]: {
    category: 'knowledge',
    boundTo: 'FAQ extract jobs',
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

export const DEFAULT_KB_FAQ_INDEX_COMMAND_TEMPLATE =
  'openkms-cli kb faq-index --job-id {job_id}';

export const DEFAULT_KB_FAQ_INDEX_WORKFLOW_FILE = 'openkms-kb-faq-index.yml';

export const DEFAULT_KB_FAQ_EXTRACT_COMMAND_TEMPLATE =
  'openkms-cli kb faq-extract --job-id {job_id}';

export const DEFAULT_KB_FAQ_EXTRACT_WORKFLOW_FILE = 'openkms-kb-faq-extract.yml';

/** GitHub Actions workflow_file fallback when pipeline.workflow_file is blank. */
export function defaultKbImportWorkflowFile(pipelineName: string): string {
  switch (pipelineName) {
    case RAG_KB_PIPELINE_NAME:
      return DEFAULT_KB_RAG_INDEX_WORKFLOW_FILE;
    case FAQ_KB_INDEX_PIPELINE_NAME:
      return DEFAULT_KB_FAQ_INDEX_WORKFLOW_FILE;
    case FAQ_KB_EXTRACT_PIPELINE_NAME:
      return DEFAULT_KB_FAQ_EXTRACT_WORKFLOW_FILE;
    case PAGE_INDEX_KB_PIPELINE_NAME:
      return DEFAULT_KB_PAGEINDEX_IMPORT_WORKFLOW_FILE;
    default:
      return DEFAULT_KB_PAGEINDEX_IMPORT_WORKFLOW_FILE;
  }
}

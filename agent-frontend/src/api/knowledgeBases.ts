import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type KnowledgeBaseType = 'page_index' | 'rag' | 'faq';

export type KnowledgeBaseCapabilities = {
  import: boolean;
  index: boolean;
  manual_create?: boolean;
  extract?: boolean;
};

export type KbFaqSettings = {
  auto_index_on_publish?: boolean;
  polish_agent_def_id?: string | null;
  extract_pipeline_id?: string | null;
  extract_pipeline_name?: string | null;
  /** Populated server-side from polish agent for UI. */
  polish_model_config_id?: string | null;
  polish_prompt?: string;
  polish_configuration_error?: string | null;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  type: KnowledgeBaseType;
  pipeline_id: string | null;
  pipeline_name: string | null;
  embedding_model_config_id?: string | null;
  embedding_model_name?: string | null;
  embedding_dimensions?: number;
  metadata_keys?: string[];
  faq_settings?: KbFaqSettings;
  is_configured?: boolean;
  chunk_count?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  capabilities: KnowledgeBaseCapabilities;
  item_count?: number;
};

export type KbIndexedDocument = {
  document_id: string;
  document_name: string;
  channel_path: string;
  chunk_count: number | null;
  indexed_at: string | null;
  status: 'pending' | 'indexed' | 'indexing' | 'failed';
  index_error: string | null;
};

export type KbChunk = {
  id: string;
  chunk_index: number;
  content: string;
  chunk_metadata: Record<string, unknown> | null;
  doc_metadata: Record<string, unknown> | null;
  content_hash: string | null;
  indexed_at: string;
};

export type KbDocumentChunks = {
  document_id: string;
  document_name: string;
  channel_path: string;
  chunk_count: number;
  indexed_at: string | null;
  items: KbChunk[];
  total: number;
};

export type KbItem = {
  id: string;
  knowledge_base_id: string;
  document_id: string;
  document_name: string;
  channel_path: string;
  original_s3_key: string;
  original_download_path: string;
  metadata?: Record<string, unknown> | null;
  page_index?: Record<string, unknown> | null;
  markdown?: string | null;
  parsing_result?: Record<string, unknown> | null;
  import_status: string;
  import_error: string | null;
  import_warnings: string[] | null;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KbImportJob = {
  id: string;
  knowledge_base_id: string;
  status: string;
  job_kind?: string | null;
  document_ids: string[];
  faq_ids?: string[];
  total_count: number;
  completed_count: number;
  failed_count: number;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KbFaq = {
  id: string;
  knowledge_base_id: string;
  question: string;
  answer: string;
  source_type: 'manual' | 'extracted';
  source_document_id: string | null;
  source_document_name: string | null;
  publication_status: 'draft' | 'published';
  index_status: 'pending' | 'indexing' | 'indexed' | 'failed' | null;
  index_error: string | null;
  indexed_at: string | null;
  doc_metadata: Record<string, unknown> | null;
  content_hash: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportSourceChannel = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

export type ImportSourceDocument = {
  id: string;
  name: string;
  file_type: string;
  status: string;
  updated_at: string;
};

export type ImportSources = {
  channels: ImportSourceChannel[];
  documents_by_channel: Record<string, ImportSourceDocument[]>;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const data = await authFetch('/api/knowledge-bases');
  return (data.items as KnowledgeBase[]) ?? [];
}

export async function createKnowledgeBase(input: {
  name: string;
  description?: string;
  type: KnowledgeBaseType;
}): Promise<KnowledgeBase> {
  const data = await authFetch('/api/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
      type: input.type,
    }),
  });
  return data as KnowledgeBase;
}

export async function updateKnowledgeBase(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    pipeline_id?: string | null;
    metadata_keys?: string[];
    faq_settings?: KbFaqSettings;
  },
): Promise<KnowledgeBase> {
  const data = await authFetch(`/api/knowledge-bases/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.pipeline_id !== undefined ? { pipeline_id: input.pipeline_id } : {}),
      ...(input.metadata_keys !== undefined ? { metadata_keys: input.metadata_keys } : {}),
      ...(input.faq_settings !== undefined ? { faq_settings: input.faq_settings } : {}),
    }),
  });
  return data as KnowledgeBase;
}

export type FaqPipelineOption = {
  id: string;
  name: string;
  pipeline_name: string;
  is_system: boolean;
};

export type FaqProcessingOptions = {
  extract_pipelines: FaqPipelineOption[];
  index_pipelines: FaqPipelineOption[];
  default_extract_pipeline_id: string | null;
  default_index_pipeline_id: string | null;
};

export type RagProcessingOptions = {
  index_pipelines: FaqPipelineOption[];
  default_index_pipeline_id: string | null;
};

export async function fetchFaqProcessingOptions(): Promise<FaqProcessingOptions> {
  const data = await authFetch('/api/knowledge-bases/faq-processing-options');
  return data as FaqProcessingOptions;
}

export async function fetchRagProcessingOptions(): Promise<RagProcessingOptions> {
  const data = await authFetch('/api/knowledge-bases/rag-processing-options');
  return data as RagProcessingOptions;
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  await authFetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const data = await authFetch(`/api/knowledge-bases/${id}`);
  return data as KnowledgeBase;
}

export async function listKbItems(
  knowledgeBaseId: string,
  options?: { offset?: number; limit?: number; includeContent?: boolean },
): Promise<{ items: KbItem[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.includeContent) params.set('include_content', 'true');
  const qs = params.toString();
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items${qs ? `?${qs}` : ''}`);
  return data as { items: KbItem[]; total: number };
}

export async function getKbItem(knowledgeBaseId: string, itemId: string): Promise<KbItem> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/${itemId}`);
  return data as KbItem;
}

export async function deleteKbItem(knowledgeBaseId: string, itemId: string): Promise<void> {
  await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/${itemId}`, { method: 'DELETE' });
}

export async function deleteKbItems(knowledgeBaseId: string, itemIds: string[]): Promise<number> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/items/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  });
  return (data.deleted_count as number) ?? itemIds.length;
}

export async function fetchImportSources(): Promise<ImportSources> {
  const data = await authFetch('/api/knowledge-bases/import-sources');
  return data as ImportSources;
}

export async function startKbImport(
  knowledgeBaseId: string,
  input: { channelIds?: string[]; documentIds?: string[] },
): Promise<{ job: KbImportJob; document_count: number }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_ids: input.channelIds ?? [],
      document_ids: input.documentIds ?? [],
    }),
  });
  return data as { job: KbImportJob; document_count: number };
}

export async function getKbImportJob(knowledgeBaseId: string, jobId: string): Promise<KbImportJob> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/import-jobs/${jobId}`);
  return data as KbImportJob;
}

export async function getActiveKbImportJob(
  knowledgeBaseId: string,
  jobKind?: string,
): Promise<KbImportJob | null> {
  const params = jobKind ? `?job_kind=${encodeURIComponent(jobKind)}` : '';
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/import-jobs/active${params}`);
  return (data.job as KbImportJob | null) ?? null;
}

export async function listIndexedDocuments(
  knowledgeBaseId: string,
  options?: { offset?: number; limit?: number },
): Promise<{ items: KbIndexedDocument[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));
  const qs = params.toString();
  const data = await authFetch(
    `/api/knowledge-bases/${knowledgeBaseId}/indexed-documents${qs ? `?${qs}` : ''}`,
  );
  return data as { items: KbIndexedDocument[]; total: number };
}

/** Paginate indexed-documents until all document ids are collected. */
export async function listAllIndexedDocumentIds(knowledgeBaseId: string): Promise<string[]> {
  const pageSize = 100;
  const ids: string[] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await listIndexedDocuments(knowledgeBaseId, { offset, limit: pageSize });
    total = page.total;
    ids.push(...page.items.map((item) => item.document_id));
    offset += pageSize;
  } while (offset < total);

  return ids;
}

export async function listDocumentChunks(
  knowledgeBaseId: string,
  documentId: string,
  options?: { offset?: number; limit?: number },
): Promise<KbDocumentChunks> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));
  const qs = params.toString();
  const data = await authFetch(
    `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/chunks${qs ? `?${qs}` : ''}`,
  );
  return data as KbDocumentChunks;
}

export async function deleteDocumentChunks(
  knowledgeBaseId: string,
  documentId: string,
): Promise<number> {
  const data = await authFetch(
    `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/chunks`,
    { method: 'DELETE' },
  );
  return (data.deleted as number) ?? 0;
}

export async function listKbFaqs(
  knowledgeBaseId: string,
  options?: {
    offset?: number;
    limit?: number;
    publication_status?: 'draft' | 'published';
    q?: string;
  },
): Promise<{ items: KbFaq[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.publication_status) params.set('publication_status', options.publication_status);
  if (options?.q) params.set('q', options.q);
  const qs = params.toString();
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs${qs ? `?${qs}` : ''}`);
  return data as { items: KbFaq[]; total: number };
}

export async function createKbFaq(
  knowledgeBaseId: string,
  input: { question: string; answer: string },
): Promise<KbFaq> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as KbFaq;
}

export async function updateKbFaq(
  knowledgeBaseId: string,
  faqId: string,
  input: { question?: string; answer?: string },
): Promise<KbFaq> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs/${faqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data as KbFaq;
}

export async function deleteKbFaqs(knowledgeBaseId: string, faqIds: string[]): Promise<number> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faq_ids: faqIds }),
  });
  return (data.deleted_count as number) ?? faqIds.length;
}

export async function batchPublishKbFaqs(
  knowledgeBaseId: string,
  faqIds: string[],
): Promise<{ published_count: number; index_job?: KbImportJob }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs/batch-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faq_ids: faqIds }),
  });
  return data as { published_count: number; index_job?: KbImportJob };
}

export async function batchDraftKbFaqs(
  knowledgeBaseId: string,
  faqIds: string[],
): Promise<{ draft_count: number }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs/batch-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faq_ids: faqIds }),
  });
  return data as { draft_count: number };
}

export async function polishKbFaqAnswer(
  knowledgeBaseId: string,
  input: { faq_id?: string; question?: string; answer?: string },
): Promise<{ answer: string }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/faqs/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal:
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(190_000)
        : undefined,
  });
  return data as { answer: string };
}

export async function startKbFaqExtract(
  knowledgeBaseId: string,
  input: { channelIds?: string[]; documentIds?: string[] },
): Promise<{ job: KbImportJob; document_count: number }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_ids: input.channelIds ?? [],
      document_ids: input.documentIds ?? [],
    }),
  });
  return data as { job: KbImportJob; document_count: number };
}

export async function startKbFaqIndex(
  knowledgeBaseId: string,
  faqIds: string[],
): Promise<{ job: KbImportJob; faq_count: number }> {
  const data = await authFetch(`/api/knowledge-bases/${knowledgeBaseId}/index-faqs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faq_ids: faqIds }),
  });
  return data as { job: KbImportJob; faq_count: number };
}

export type ImportSourceChannelNode = ImportSourceChannel & { children: ImportSourceChannelNode[] };

export function buildChannelTree(channels: ImportSourceChannel[]): ImportSourceChannelNode[] {
  const nodes = new Map<string, ImportSourceChannelNode>();
  for (const ch of channels) {
    nodes.set(ch.id, { ...ch, children: [] });
  }
  const roots: ImportSourceChannelNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function collectDescendantChannelIds(
  rootId: string,
  channels: ImportSourceChannel[],
): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const ch of channels) {
    const list = childrenByParent.get(ch.parent_id) ?? [];
    list.push(ch.id);
    childrenByParent.set(ch.parent_id, list);
  }
  const result = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}

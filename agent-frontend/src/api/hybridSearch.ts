import { apiUrl } from './base.ts';
import { getToken } from './auth.ts';
import { formatApiError } from './http.ts';

export type HybridSearchType = 'all' | 'chunks' | 'faqs';

export type HybridSearchSettings = {
  bm25_enabled?: boolean;
  rrf_k?: number;
  recall_k?: number;
  rerank_model_config_id?: string | null;
  rerank_instruct?: string | null;
};

export type HybridSearchRequest = {
  query: string;
  knowledge_base_ids: string[];
  search_type?: HybridSearchType;
  top_k?: number;
  settings?: HybridSearchSettings;
};

export type HybridRetrievalDebug = {
  embedding_group_id: string;
  dense_rank?: number;
  dense_score?: number;
  lexical_rank?: number;
  lexical_score?: number;
  rrf_score?: number;
  rerank_score?: number;
  pipeline_stages: string[];
};

export type SourceLocator = {
  page_num?: number;
  line_num?: number;
  node_id?: string;
  heading?: string;
  char_start?: number;
  char_end?: number;
  sheet_index?: number;
};

export type SourceRef = {
  document_id: string;
  document_name: string;
  file_type: string | null;
  knowledge_base_id: string;
  chunk_id: string;
  chunk_index: number | null;
  source_type: 'chunk' | 'faq';
  locator: SourceLocator | null;
  parsed_url: string;
  original_url: string;
  preview_url: string;
};

export type HybridSearchResult = {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  source_type: 'chunk' | 'faq';
  content: string;
  score: number;
  source: SourceRef | null;
  retrieval_mode: 'hybrid' | 'dense' | 'lexical' | 'rerank';
  retrieval_debug?: HybridRetrievalDebug;
};

export type HybridSearchResponse = {
  query: string;
  results: HybridSearchResult[];
  meta: {
    total_candidates: number;
    kbs_searched: number;
    embedding_groups: number;
    duration_ms: number;
    rerank_applied: boolean;
    rerank_failed?: boolean;
  };
};

export type HybridSearchPreferences = {
  top_k: number;
  search_type: HybridSearchType;
  bm25_enabled: boolean;
  rrf_k: number;
  recall_k: number;
  rerank_model_config_id: string | null;
  rerank_instruct: string | null;
  selected_knowledge_base_ids: string[];
};

export type SearchableKnowledgeBase = {
  id: string;
  name: string;
  type: 'rag' | 'faq';
  embedding_model_config_id: string;
  embedding_model_name: string | null;
};

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new Error(formatApiError(data.error, `HTTP ${res.status}`));
  return data;
}

export async function listHybridSearchKnowledgeBases(): Promise<SearchableKnowledgeBase[]> {
  const data = await authFetch('/api/hybrid-search/knowledge-bases');
  return (data.items as SearchableKnowledgeBase[]) ?? [];
}

export async function runHybridSearch(body: HybridSearchRequest): Promise<HybridSearchResponse> {
  return (await authFetch('/api/hybrid-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })) as HybridSearchResponse;
}

export async function getHybridSearchPreferences(): Promise<HybridSearchPreferences> {
  const data = await authFetch('/api/hybrid-search/preferences');
  return data.preferences as HybridSearchPreferences;
}

export async function patchHybridSearchPreferences(
  patch: Partial<HybridSearchPreferences>,
): Promise<HybridSearchPreferences> {
  const data = await authFetch('/api/hybrid-search/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return data.preferences as HybridSearchPreferences;
}

export function groupKnowledgeBasesByEmbedding(
  items: SearchableKnowledgeBase[],
): Array<{ embeddingModelConfigId: string; embeddingModelName: string; items: SearchableKnowledgeBase[] }> {
  const map = new Map<string, SearchableKnowledgeBase[]>();
  for (const item of items) {
    const list = map.get(item.embedding_model_config_id) ?? [];
    list.push(item);
    map.set(item.embedding_model_config_id, list);
  }
  return [...map.entries()].map(([embeddingModelConfigId, grouped]) => ({
    embeddingModelConfigId,
    embeddingModelName: grouped[0]?.embedding_model_name ?? embeddingModelConfigId,
    items: grouped,
  }));
}

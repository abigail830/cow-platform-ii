export type HybridSearchType = 'all' | 'chunks' | 'faqs';

export type HybridSourceType = 'chunk' | 'faq';

export type HybridRetrievalMode = 'hybrid' | 'dense' | 'lexical' | 'rerank';

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

import type { SourceRef } from './source-ref.ts';

export type HybridSearchResult = {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  source_type: HybridSourceType;
  content: string;
  score: number;
  source: SourceRef | null;
  retrieval_mode: HybridRetrievalMode;
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

export type EmbeddingGroup = {
  embeddingModelConfigId: string;
  embeddingModelName: string | null;
  knowledgeBaseIds: string[];
  knowledgeBases: SearchableKnowledgeBase[];
};

export type RecallCandidate = {
  key: string;
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  sourceType: HybridSourceType;
  content: string;
  sourceName?: string;
  documentId?: string;
  fileType?: string;
  chunkIndex?: number;
  chunkMetadata?: Record<string, unknown> | null;
  embeddingGroupId: string;
  denseScore?: number;
  denseRank?: number;
  lexicalScore?: number;
  lexicalRank?: number;
  rrfScore?: number;
};

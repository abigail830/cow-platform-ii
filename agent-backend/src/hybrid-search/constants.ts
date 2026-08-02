import type { HybridSearchPreferences } from './types.ts';

export const HYBRID_SEARCH_PREF_KEY = 'hybrid-search';

export const DEFAULT_HYBRID_SEARCH_PREFERENCES: HybridSearchPreferences = {
  top_k: 10,
  search_type: 'all',
  bm25_enabled: true,
  rrf_k: 60,
  recall_k: 25,
  rerank_model_config_id: null,
  rerank_instruct: null,
  selected_knowledge_base_ids: [],
};

export const DEFAULT_RRF_K = 60;
export const DEFAULT_RECALL_K = 25;
export const DEFAULT_TOP_K = 10;
export const MAX_TOP_K = 50;
export const MAX_RECALL_K = 100;
export const RERANK_INPUT_CAP = 100;
export const DEFAULT_RERANK_INSTRUCT =
  'Given a web search query, retrieve relevant passages that answer the query.';

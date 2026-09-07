import type {
  EmbeddingGroup,
  HybridSearchPreferences,
  HybridSearchType,
  RecallCandidate,
  SearchableKnowledgeBase,
} from './types.ts';

export type ModelConnection = {
  modelId: string;
  configName: string;
  baseUrl: string;
  modelName: string;
  apiKey: string | null;
  extraConfig: Record<string, unknown>;
};

export type RerankScore = {
  index: number;
  score: number;
};

export interface KnowledgeBaseStore {
  listSearchable(input: { types?: Array<'rag' | 'faq'>; ids?: string[] }): Promise<SearchableKnowledgeBase[]>;
  loadForSearch(ids: string[]): Promise<SearchableKnowledgeBase[]>;
}

export interface RecallStore {
  denseRecall(input: {
    kbIds: string[];
    kbNames: Map<string, string>;
    embeddingGroupId: string;
    queryVector: number[];
    searchType: HybridSearchType;
    limit: number;
  }): Promise<RecallCandidate[]>;

  lexicalRecall(input: {
    kbIds: string[];
    kbNames: Map<string, string>;
    embeddingGroupId: string;
    query: string;
    searchType: HybridSearchType;
    limit: number;
  }): Promise<RecallCandidate[]>;
}

export interface EmbeddingClient {
  embedQuery(connection: ModelConnection, query: string, dimensions?: number): Promise<number[]>;
}

export interface RerankClient {
  rerank(input: {
    connection: ModelConnection;
    query: string;
    documents: string[];
    topN: number;
    instruct?: string | null;
  }): Promise<RerankScore[]>;
}

export interface ModelConfigResolver {
  resolveEmbeddingModel(modelConfigId: string): Promise<ModelConnection>;
  resolveRerankModel(modelConfigId: string): Promise<ModelConnection>;
}

export interface PreferencesStore {
  get(userId: string): Promise<HybridSearchPreferences>;
  patch(userId: string, patch: Partial<HybridSearchPreferences>): Promise<HybridSearchPreferences>;
}

export type HybridSearchDeps = {
  kbStore: KnowledgeBaseStore;
  recallStore: RecallStore;
  embeddingClient: EmbeddingClient;
  rerankClient: RerankClient;
  modelResolver: ModelConfigResolver;
  preferencesStore: PreferencesStore;
};

export type { EmbeddingGroup };

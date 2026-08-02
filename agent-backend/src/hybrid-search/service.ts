import { createOpenAiCompatibleEmbeddingClient } from './adapters/embedding-client.ts';
import { createDrizzleKnowledgeBaseStore } from './adapters/drizzle-kb-store.ts';
import { createDrizzlePreferencesStore } from './adapters/drizzle-preferences-store.ts';
import { createDrizzleRecallStore } from './adapters/drizzle-recall-store.ts';
import { createModelConfigResolver } from './adapters/model-config-resolver.ts';
import { createRerankClient } from './adapters/rerank-client.ts';
import { runHybridSearch } from './core/retriever.ts';
import type { HybridSearchDeps } from './ports.ts';
import type { HybridSearchRequest } from './types.ts';

export function createDefaultHybridSearchDeps(): HybridSearchDeps {
  return {
    kbStore: createDrizzleKnowledgeBaseStore(),
    recallStore: createDrizzleRecallStore(),
    embeddingClient: createOpenAiCompatibleEmbeddingClient(),
    rerankClient: createRerankClient(),
    modelResolver: createModelConfigResolver(),
    preferencesStore: createDrizzlePreferencesStore(),
  };
}

export function createHybridSearchService(deps: HybridSearchDeps = createDefaultHybridSearchDeps()) {
  return {
    search(request: HybridSearchRequest) {
      return runHybridSearch(deps, request);
    },
    listSearchableKnowledgeBases() {
      return deps.kbStore.listSearchable({ types: ['rag', 'faq'] });
    },
    getPreferences(userId: string) {
      return deps.preferencesStore.get(userId);
    },
    patchPreferences(userId: string, patch: Parameters<typeof deps.preferencesStore.patch>[1]) {
      return deps.preferencesStore.patch(userId, patch);
    },
  };
}

export type HybridSearchService = ReturnType<typeof createHybridSearchService>;

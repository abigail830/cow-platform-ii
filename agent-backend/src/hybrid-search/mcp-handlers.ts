import { listAccessibleKnowledgeBaseIds } from '../auth/resource-access.ts';
import { userHasResourcePermission } from '../auth/rbac.ts';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import type { AuthUser } from '../auth/jwt.ts';
import { redactSandboxSecrets } from '../sandboxes/sandbox-secret-redact.ts';
import { createHybridSearchService, type HybridSearchService } from './service.ts';
import type { HybridSearchRequest } from './types.ts';

function jsonText(payload: unknown): string {
  return redactSandboxSecrets(JSON.stringify(payload, null, 2));
}

async function assertHybridSearchRead(user: AuthUser): Promise<void> {
  const allowed = await userHasResourcePermission(
    user.id,
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.HYBRID_SEARCH,
    'read',
  );
  if (!allowed) {
    throw new Error('Forbidden');
  }
}

export type HybridSearchMcpHandlers = {
  listKnowledgeBases: (input: { group_by_embedding?: boolean }) => Promise<string>;
  hybridSearch: (input: HybridSearchMcpInput) => Promise<string>;
};

export type HybridSearchMcpInput = {
  query: string;
  kb_ids?: string[];
  top_k?: number;
  search_type?: 'all' | 'chunks' | 'faqs';
  recall_k?: number;
  rrf_k?: number;
  no_bm25?: boolean;
  rerank_model_id?: string;
};

export function createHybridSearchMcpHandlers(
  user: AuthUser,
  service: HybridSearchService = createHybridSearchService(),
): HybridSearchMcpHandlers {
  return {
    async listKnowledgeBases(input) {
      await assertHybridSearchRead(user);
      const visibleIds = await listAccessibleKnowledgeBaseIds(user.id);
      const items = await service.listSearchableKnowledgeBases([...visibleIds]);
      const visible_id_list = items.map((item) => item.id);

      if (input.group_by_embedding) {
        const groups: Record<string, typeof items> = {};
        for (const item of items) {
          const embId = item.embedding_model_config_id ?? 'unknown';
          if (!groups[embId]) groups[embId] = [];
          groups[embId].push(item);
        }
        return jsonText({
          visible_ids: visible_id_list,
          groups: Object.entries(groups).map(([embId, group]) => ({
            embedding_model_config_id: embId,
            embedding_model_name: group[0]?.embedding_model_name ?? null,
            items: group,
          })),
        });
      }

      return jsonText({ visible_ids: visible_id_list, items });
    },

    async hybridSearch(input) {
      await assertHybridSearchRead(user);
      const visibleIds = await listAccessibleKnowledgeBaseIds(user.id);
      const visible = [...visibleIds];

      if (!visible.length) {
        throw new Error('No searchable knowledge bases visible to this user.');
      }

      let kbIds = visible;
      if (input.kb_ids?.length) {
        const illegal = input.kb_ids.filter((id) => !visibleIds.has(id));
        if (illegal.length > 0) {
          throw new Error(
            `Knowledge base IDs not visible or invalid: ${illegal.join(', ')}. Re-run list_knowledge_bases.`,
          );
        }
        kbIds = input.kb_ids;
      }

      const request: HybridSearchRequest = {
        query: input.query.trim(),
        knowledge_base_ids: kbIds,
        search_type: input.search_type,
        top_k: input.top_k,
        settings: {
          bm25_enabled: input.no_bm25 ? false : undefined,
          rrf_k: input.rrf_k,
          recall_k: input.recall_k,
          rerank_model_config_id: input.rerank_model_id ?? undefined,
        },
      };

      const result = await service.search(request);
      return jsonText(result);
    },
  };
}

import { and, eq, inArray } from 'drizzle-orm';
import { appKnowledgeBases, appModelConfigs, db } from '../../db/index.ts';
import type { KnowledgeBaseStore } from '../ports.ts';
import type { SearchableKnowledgeBase } from '../types.ts';

function toSearchable(
  row: typeof appKnowledgeBases.$inferSelect,
  modelName: string | null,
): SearchableKnowledgeBase | null {
  if (!row.embeddingModelConfigId) return null;
  if (row.type !== 'rag' && row.type !== 'faq') return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    embedding_model_config_id: row.embeddingModelConfigId,
    embedding_model_name: modelName,
  };
}

export function createDrizzleKnowledgeBaseStore(): KnowledgeBaseStore {
  return {
    async listSearchable() {
      const rows = await db
        .select({
          kb: appKnowledgeBases,
          modelName: appModelConfigs.name,
        })
        .from(appKnowledgeBases)
        .leftJoin(appModelConfigs, eq(appKnowledgeBases.embeddingModelConfigId, appModelConfigs.id))
        .where(inArray(appKnowledgeBases.type, ['rag', 'faq']));

      return rows
        .map((row) => toSearchable(row.kb, row.modelName))
        .filter((item): item is SearchableKnowledgeBase => item != null);
    },

    async loadForSearch(ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          kb: appKnowledgeBases,
          modelName: appModelConfigs.name,
        })
        .from(appKnowledgeBases)
        .leftJoin(appModelConfigs, eq(appKnowledgeBases.embeddingModelConfigId, appModelConfigs.id))
        .where(
          and(
            inArray(appKnowledgeBases.id, ids),
            inArray(appKnowledgeBases.type, ['rag', 'faq']),
          ),
        );

      return rows
        .map((row) => toSearchable(row.kb, row.modelName))
        .filter((item): item is SearchableKnowledgeBase => item != null);
    },
  };
}

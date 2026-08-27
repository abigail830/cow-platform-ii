import { and, eq } from 'drizzle-orm';
import { appUserPreferences, db } from '../../db/index.ts';
import { getDefaultModelConfig } from '../../shared/model/model-config-store.ts';
import {
  DEFAULT_HYBRID_SEARCH_PREFERENCES,
  HYBRID_SEARCH_PREF_KEY,
} from '../constants.ts';
import type { PreferencesStore } from '../ports.ts';
import type { HybridSearchPreferences, HybridSearchType } from '../types.ts';

function normalizePreferences(value: Record<string, unknown> | null | undefined): HybridSearchPreferences {
  const base = { ...DEFAULT_HYBRID_SEARCH_PREFERENCES };
  if (!value) return base;

  if (typeof value.top_k === 'number') base.top_k = value.top_k;
  if (value.search_type === 'all' || value.search_type === 'chunks' || value.search_type === 'faqs') {
    base.search_type = value.search_type as HybridSearchType;
  }
  if (typeof value.bm25_enabled === 'boolean') base.bm25_enabled = value.bm25_enabled;
  if (typeof value.rrf_k === 'number') base.rrf_k = value.rrf_k;
  if (typeof value.recall_k === 'number') base.recall_k = value.recall_k;
  if (typeof value.rerank_model_config_id === 'string' || value.rerank_model_config_id === null) {
    base.rerank_model_config_id = value.rerank_model_config_id;
  }
  if (typeof value.rerank_instruct === 'string' || value.rerank_instruct === null) {
    base.rerank_instruct = value.rerank_instruct;
  }
  if (Array.isArray(value.selected_knowledge_base_ids)) {
    base.selected_knowledge_base_ids = value.selected_knowledge_base_ids.filter(
      (id): id is string => typeof id === 'string',
    );
  }
  return base;
}

async function initialPreferences(): Promise<HybridSearchPreferences> {
  const prefs = { ...DEFAULT_HYBRID_SEARCH_PREFERENCES };
  const defaultRerank = await getDefaultModelConfig('rerank');
  if (defaultRerank) {
    prefs.rerank_model_config_id = defaultRerank.id;
  }
  return prefs;
}

export function createDrizzlePreferencesStore(): PreferencesStore {
  return {
    async get(userId) {
      const [row] = await db
        .select()
        .from(appUserPreferences)
        .where(
          and(
            eq(appUserPreferences.userId, userId),
            eq(appUserPreferences.prefKey, HYBRID_SEARCH_PREF_KEY),
          ),
        )
        .limit(1);
      if (!row) return initialPreferences();
      return normalizePreferences(row.prefValue);
    },

    async patch(userId, patch) {
      const current = await this.get(userId);
      const next = normalizePreferences({ ...current, ...patch });
      await db
        .insert(appUserPreferences)
        .values({
          userId,
          prefKey: HYBRID_SEARCH_PREF_KEY,
          prefValue: next,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [appUserPreferences.userId, appUserPreferences.prefKey],
          set: { prefValue: next, updatedAt: new Date() },
        });
      return next;
    },
  };
}

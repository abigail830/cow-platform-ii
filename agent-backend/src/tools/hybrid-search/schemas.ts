import { z } from 'zod';
import { MAX_RECALL_K, MAX_TOP_K } from './constants.ts';

const hybridSearchSettingsSchema = z.object({
  bm25_enabled: z.boolean().optional(),
  rrf_k: z.number().int().min(1).max(200).optional(),
  recall_k: z.number().int().min(1).max(MAX_RECALL_K).optional(),
  rerank_model_config_id: z.string().uuid().nullable().optional(),
  rerank_instruct: z.string().max(2000).nullable().optional(),
});

export const hybridSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  knowledge_base_ids: z.array(z.string().uuid()).min(1).max(50),
  search_type: z.enum(['all', 'chunks', 'faqs']).optional(),
  top_k: z.number().int().min(1).max(MAX_TOP_K).optional(),
  settings: hybridSearchSettingsSchema.optional(),
});

export const hybridSearchPreferencesPatchSchema = z
  .object({
    top_k: z.number().int().min(1).max(MAX_TOP_K).optional(),
    search_type: z.enum(['all', 'chunks', 'faqs']).optional(),
    bm25_enabled: z.boolean().optional(),
    rrf_k: z.number().int().min(1).max(200).optional(),
    recall_k: z.number().int().min(1).max(MAX_RECALL_K).optional(),
    rerank_model_config_id: z.string().uuid().nullable().optional(),
    rerank_instruct: z.string().max(2000).nullable().optional(),
    selected_knowledge_base_ids: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();

import {
  DEFAULT_RECALL_K,
  DEFAULT_RRF_K,
  DEFAULT_TOP_K,
  MAX_RECALL_K,
  MAX_TOP_K,
  RERANK_INPUT_CAP,
} from '../constants.ts';
import { groupKbsByEmbeddingModel, kbNameById } from './embedding-groups.ts';
import { reciprocalRankFusion } from './rrf.ts';
import { buildSourceRef } from '../source-ref.ts';
import type { HybridSearchDeps } from '../ports.ts';
import type {
  HybridSearchRequest,
  HybridSearchResponse,
  HybridSearchResult,
  HybridSearchSettings,
  RecallCandidate,
} from '../types.ts';

function clampInt(value: number | undefined, fallback: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

function resolveSettings(request: HybridSearchRequest): Required<
  Pick<HybridSearchSettings, 'bm25_enabled' | 'rrf_k' | 'recall_k'> & {
    rerank_model_config_id: string | null;
    rerank_instruct: string | null;
  }
> {
  const settings = request.settings ?? {};
  return {
    bm25_enabled: settings.bm25_enabled !== false,
    rrf_k: clampInt(settings.rrf_k, DEFAULT_RRF_K, 200),
    recall_k: clampInt(settings.recall_k, DEFAULT_RECALL_K, MAX_RECALL_K),
    rerank_model_config_id: settings.rerank_model_config_id ?? null,
    rerank_instruct: settings.rerank_instruct ?? null,
  };
}

function attachRrfScores(
  dense: RecallCandidate[],
  lexical: RecallCandidate[],
  rrfK: number,
  recallK: number,
): RecallCandidate[] {
  const byKey = new Map<string, RecallCandidate>();

  dense.forEach((item, rank) => {
    byKey.set(item.key, { ...item, denseRank: rank, denseScore: item.denseScore });
  });
  lexical.forEach((item, rank) => {
    const existing = byKey.get(item.key);
    if (existing) {
      byKey.set(item.key, {
        ...existing,
        lexicalRank: rank,
        lexicalScore: item.lexicalScore,
      });
    } else {
      byKey.set(item.key, { ...item, lexicalRank: rank, lexicalScore: item.lexicalScore });
    }
  });

  const fused = reciprocalRankFusion(
    [dense.map((c) => ({ key: c.key })), lexical.map((c) => ({ key: c.key }))],
    rrfK,
    recallK,
  );

  return fused
    .map(({ key, score }) => {
      const candidate = byKey.get(key);
      if (!candidate) return null;
      return { ...candidate, rrfScore: score } satisfies RecallCandidate;
    })
    .filter((item): item is RecallCandidate => item != null);
}

function fallbackInterleave(groups: RecallCandidate[][]): RecallCandidate[] {
  const out: RecallCandidate[] = [];
  const maxLen = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const group of groups) {
      if (group[i]) out.push(group[i]);
    }
  }
  return out;
}

function toSearchResult(
  candidate: RecallCandidate,
  score: number,
  mode: HybridSearchResult['retrieval_mode'],
  rerankScore?: number,
): HybridSearchResult {
  const stages: string[] = [];
  if (candidate.denseRank != null) stages.push('dense');
  if (candidate.lexicalRank != null) stages.push('lexical');
  if (candidate.rrfScore != null) stages.push('rrf');
  if (rerankScore != null) stages.push('rerank');

  return {
    id: candidate.id,
    knowledge_base_id: candidate.knowledgeBaseId,
    knowledge_base_name: candidate.knowledgeBaseName,
    source_type: candidate.sourceType,
    content: candidate.content,
    score,
    source: buildSourceRef({
      chunkId: candidate.id,
      knowledgeBaseId: candidate.knowledgeBaseId,
      sourceType: candidate.sourceType,
      documentId: candidate.documentId,
      documentName: candidate.sourceName,
      fileType: candidate.fileType,
      chunkIndex: candidate.chunkIndex,
      chunkMetadata: candidate.chunkMetadata,
    }),
    retrieval_mode: mode,
    retrieval_debug: {
      embedding_group_id: candidate.embeddingGroupId,
      dense_rank: candidate.denseRank,
      dense_score: candidate.denseScore,
      lexical_rank: candidate.lexicalRank,
      lexical_score: candidate.lexicalScore,
      rrf_score: candidate.rrfScore,
      rerank_score: rerankScore,
      pipeline_stages: stages,
    },
  };
}

export async function runHybridSearch(
  deps: HybridSearchDeps,
  request: HybridSearchRequest,
): Promise<HybridSearchResponse> {
  const started = Date.now();
  const query = request.query.trim();
  if (!query) throw new Error('query is required');

  const kbIds = [...new Set(request.knowledge_base_ids)];
  if (kbIds.length === 0) throw new Error('knowledge_base_ids is required');

  const kbs = await deps.kbStore.loadForSearch(kbIds);
  if (kbs.length === 0) throw new Error('No searchable knowledge bases found');

  const missing = kbIds.filter((id) => !kbs.some((kb) => kb.id === id));
  if (missing.length > 0) {
    throw new Error(`Knowledge base not found or not searchable: ${missing.join(', ')}`);
  }

  const groups = groupKbsByEmbeddingModel(kbs);
  const settings = resolveSettings(request);
  const searchType = request.search_type ?? 'all';
  const topK = clampInt(request.top_k, DEFAULT_TOP_K, MAX_TOP_K);

  const multiGroup = groups.length > 1;
  if (multiGroup && !settings.rerank_model_config_id) {
    throw new Error('rerank model is required when searching across multiple embedding models');
  }

  const groupCandidates: RecallCandidate[][] = [];

  for (const group of groups) {
    const kbNames = kbNameById(group);
    const connection = await deps.modelResolver.resolveEmbeddingModel(group.embeddingModelConfigId);
    let queryVector: number[];
    try {
      queryVector = await deps.embeddingClient.embedQuery(connection, query);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Embedding failed for model "${connection.configName}" (${connection.baseUrl}): ${detail}`,
      );
    }

    const dense = await deps.recallStore.denseRecall({
      kbIds: group.knowledgeBaseIds,
      kbNames,
      embeddingGroupId: group.embeddingModelConfigId,
      queryVector,
      searchType,
      limit: settings.recall_k,
    });

    let lexical: RecallCandidate[] = [];
    if (settings.bm25_enabled) {
      lexical = await deps.recallStore.lexicalRecall({
        kbIds: group.knowledgeBaseIds,
        kbNames,
        embeddingGroupId: group.embeddingModelConfigId,
        query,
        searchType,
        limit: settings.recall_k,
      });
    }

    let fused: RecallCandidate[];
    if (settings.bm25_enabled && lexical.length > 0 && dense.length > 0) {
      fused = attachRrfScores(dense, lexical, settings.rrf_k, settings.recall_k);
    } else if (dense.length > 0) {
      fused = dense.slice(0, settings.recall_k);
    } else {
      fused = lexical.slice(0, settings.recall_k);
    }

    groupCandidates.push(fused);
  }

  const merged = groupCandidates.flat().slice(0, RERANK_INPUT_CAP);
  let rerankApplied = false;
  let results: HybridSearchResult[] = [];

  const shouldRerank = Boolean(settings.rerank_model_config_id) && merged.length > 0;

  if (shouldRerank && settings.rerank_model_config_id) {
    const rerankConnection = await deps.modelResolver.resolveRerankModel(
      settings.rerank_model_config_id,
    );
    try {
      const rerankScores = await deps.rerankClient.rerank({
        connection: rerankConnection,
        query,
        documents: merged.map((c) => c.content),
        topN: topK,
        instruct: settings.rerank_instruct,
      });
      rerankApplied = true;
      results = rerankScores.map(({ index, score }) =>
        toSearchResult(merged[index]!, score, 'rerank', score),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Rerank failed for model "${rerankConnection.configName}" (${rerankConnection.baseUrl}): ${detail}`,
      );
    }
  } else {
    const ranked = multiGroup ? fallbackInterleave(groupCandidates) : merged;
    results = ranked.slice(0, topK).map((candidate) => {
      const mode =
        candidate.rrfScore != null
          ? 'hybrid'
          : candidate.denseScore != null
            ? 'dense'
            : 'lexical';
      const score = candidate.rrfScore ?? candidate.denseScore ?? candidate.lexicalScore ?? 0;
      return toSearchResult(candidate, score, mode);
    });
  }

  return {
    query,
    results,
    meta: {
      total_candidates: merged.length,
      kbs_searched: kbs.length,
      embedding_groups: groups.length,
      duration_ms: Date.now() - started,
      rerank_applied: rerankApplied,
    },
  };
}

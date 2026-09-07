import type { EmbeddingGroup, SearchableKnowledgeBase } from '../types.ts';

export function groupKbsByEmbeddingModel(kbs: SearchableKnowledgeBase[]): EmbeddingGroup[] {
  const map = new Map<string, SearchableKnowledgeBase[]>();
  for (const kb of kbs) {
    if (!kb.embedding_model_config_id) continue;
    const list = map.get(kb.embedding_model_config_id) ?? [];
    list.push(kb);
    map.set(kb.embedding_model_config_id, list);
  }

  return [...map.entries()].map(([embeddingModelConfigId, knowledgeBases]) => ({
    embeddingModelConfigId,
    embeddingModelName: knowledgeBases[0]?.embedding_model_name ?? null,
    knowledgeBaseIds: knowledgeBases.map((kb) => kb.id),
    knowledgeBases,
  }));
}

export function kbNameById(group: EmbeddingGroup): Map<string, string> {
  return new Map(group.knowledgeBases.map((kb) => [kb.id, kb.name]));
}

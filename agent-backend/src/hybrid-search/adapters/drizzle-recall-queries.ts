import type { RecallCandidate, HybridSearchType } from '../types.ts';

export function candidateKey(kbId: string, sourceType: string, id: string): string {
  return `${kbId}:${sourceType}:${id}`;
}

export function formatFaqContent(question: string, answer: string): string {
  return `Q: ${question}\nA: ${answer}`;
}

type RecallRow = {
  id: string;
  knowledge_base_id: string;
  source_type: HybridSearchType extends never ? never : 'chunk' | 'faq';
  content: string;
  source_name: string | null;
  document_id: string | null;
  chunk_index: number | null;
  score: number;
};

function toRecallCandidate(
  row: RecallRow,
  kbNames: Map<string, string>,
  embeddingGroupId: string,
): RecallCandidate {
  return {
    key: candidateKey(row.knowledge_base_id, row.source_type, row.id),
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    knowledgeBaseName: kbNames.get(row.knowledge_base_id) ?? row.knowledge_base_id,
    sourceType: row.source_type,
    content: row.content,
    sourceName: row.source_name ?? undefined,
    documentId: row.document_id ?? undefined,
    chunkIndex: row.chunk_index ?? undefined,
    embeddingGroupId,
  };
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function queryDenseChunks(
  pool: import('pg').Pool,
  input: {
    kbIds: string[];
    queryVector: number[];
    limit: number;
    kbNames: Map<string, string>;
    embeddingGroupId: string;
  },
): Promise<RecallCandidate[]> {
  if (input.kbIds.length === 0 || input.limit <= 0) return [];

  const result = await pool.query<RecallRow>(
    `SELECT c.id,
            c.knowledge_base_id,
            'chunk'::text AS source_type,
            c.content,
            cd.document_name AS source_name,
            c.document_id,
            c.chunk_index,
            (1 - (c.embedding <=> $1::vector))::float8 AS score
     FROM app_kb_chunks c
     LEFT JOIN app_kb_chunk_documents cd
       ON cd.knowledge_base_id = c.knowledge_base_id
      AND cd.document_id = c.document_id
     WHERE c.knowledge_base_id = ANY($2::uuid[])
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral(input.queryVector), input.kbIds, input.limit],
  );

  return result.rows.map((row, index) => {
    const candidate = toRecallCandidate(row, input.kbNames, input.embeddingGroupId);
    candidate.denseScore = Number(row.score);
    candidate.denseRank = index;
    return candidate;
  });
}

export async function queryDenseFaqs(
  pool: import('pg').Pool,
  input: {
    kbIds: string[];
    queryVector: number[];
    limit: number;
    kbNames: Map<string, string>;
    embeddingGroupId: string;
  },
): Promise<RecallCandidate[]> {
  if (input.kbIds.length === 0 || input.limit <= 0) return [];

  const result = await pool.query<RecallRow>(
    `SELECT f.id,
            f.knowledge_base_id,
            'faq'::text AS source_type,
            ('Q: ' || f.question || E'\nA: ' || f.answer) AS content,
            COALESCE(f.source_document_name, 'FAQ') AS source_name,
            f.source_document_id AS document_id,
            NULL::int AS chunk_index,
            (1 - (f.embedding <=> $1::vector))::float8 AS score
     FROM app_kb_faqs f
     WHERE f.knowledge_base_id = ANY($2::uuid[])
       AND f.publication_status = 'published'
       AND f.index_status = 'indexed'
       AND f.embedding IS NOT NULL
     ORDER BY f.embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral(input.queryVector), input.kbIds, input.limit],
  );

  return result.rows.map((row, index) => {
    const candidate = toRecallCandidate(row, input.kbNames, input.embeddingGroupId);
    candidate.denseScore = Number(row.score);
    candidate.denseRank = index;
    return candidate;
  });
}

export async function queryLexicalChunks(
  pool: import('pg').Pool,
  input: {
    kbIds: string[];
    query: string;
    limit: number;
    kbNames: Map<string, string>;
    embeddingGroupId: string;
  },
): Promise<RecallCandidate[]> {
  if (input.kbIds.length === 0 || input.limit <= 0) return [];

  const result = await pool.query<RecallRow>(
    `SELECT c.id,
            c.knowledge_base_id,
            'chunk'::text AS source_type,
            c.content,
            cd.document_name AS source_name,
            c.document_id,
            c.chunk_index,
            ts_rank_cd(c.search_vector, plainto_tsquery('simple', $1))::float8 AS score
     FROM app_kb_chunks c
     LEFT JOIN app_kb_chunk_documents cd
       ON cd.knowledge_base_id = c.knowledge_base_id
      AND cd.document_id = c.document_id
     WHERE c.knowledge_base_id = ANY($2::uuid[])
       AND c.search_vector @@ plainto_tsquery('simple', $1)
     ORDER BY score DESC
     LIMIT $3`,
    [input.query, input.kbIds, input.limit],
  );

  return result.rows.map((row, index) => {
    const candidate = toRecallCandidate(row, input.kbNames, input.embeddingGroupId);
    candidate.lexicalScore = Number(row.score);
    candidate.lexicalRank = index;
    return candidate;
  });
}

export async function queryLexicalFaqs(
  pool: import('pg').Pool,
  input: {
    kbIds: string[];
    query: string;
    limit: number;
    kbNames: Map<string, string>;
    embeddingGroupId: string;
  },
): Promise<RecallCandidate[]> {
  if (input.kbIds.length === 0 || input.limit <= 0) return [];

  const result = await pool.query<RecallRow>(
    `SELECT f.id,
            f.knowledge_base_id,
            'faq'::text AS source_type,
            ('Q: ' || f.question || E'\nA: ' || f.answer) AS content,
            COALESCE(f.source_document_name, 'FAQ') AS source_name,
            f.source_document_id AS document_id,
            NULL::int AS chunk_index,
            ts_rank_cd(f.search_vector, plainto_tsquery('simple', $1))::float8 AS score
     FROM app_kb_faqs f
     WHERE f.knowledge_base_id = ANY($2::uuid[])
       AND f.publication_status = 'published'
       AND f.index_status = 'indexed'
       AND f.search_vector @@ plainto_tsquery('simple', $1)
     ORDER BY score DESC
     LIMIT $3`,
    [input.query, input.kbIds, input.limit],
  );

  return result.rows.map((row, index) => {
    const candidate = toRecallCandidate(row, input.kbNames, input.embeddingGroupId);
    candidate.lexicalScore = Number(row.score);
    candidate.lexicalRank = index;
    return candidate;
  });
}

export function mergeRecallLists(lists: RecallCandidate[][], limit: number): RecallCandidate[] {
  const merged = lists.flat().sort((a, b) => (b.denseScore ?? b.lexicalScore ?? 0) - (a.denseScore ?? a.lexicalScore ?? 0));
  const seen = new Set<string>();
  const out: RecallCandidate[] = [];
  for (const item of merged) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

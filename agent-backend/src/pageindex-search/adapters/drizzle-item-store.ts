import { and, desc, eq, inArray } from 'drizzle-orm';
import { appDocuments, appKnowledgeBases, appKbItems, db } from '../../db/index.ts';
import { getPool } from '../../db/pool.ts';
import type { PageIndexItemRecord, PageIndexItemStore } from '../ports.ts';
import type {
  BrowseDocumentsRequest,
  BrowseDocumentsResponse,
  PageIndexDocumentCard,
  PageIndexKnowledgeBase,
} from '../types.ts';

type MetaFields = {
  abstract: string | null;
  tags: string[];
  categories: string[];
  author: string | null;
  source: string | null;
  publish_date: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function readMeta(metadata: Record<string, unknown> | null | undefined): MetaFields {
  const meta = metadata ?? {};
  return {
    abstract: asString(meta.abstract),
    tags: asStringArray(meta.tags),
    categories: asStringArray(meta.categories),
    author: asString(meta.author),
    source: asString(meta.source),
    publish_date: asString(meta.publish_date),
  };
}

function toCard(row: {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  documentName: string;
  channelPath: string;
  metadata: Record<string, unknown> | null;
  pageCount: number | null;
  pageIndexStrategy: string | null;
  markdownComplete: boolean;
  updatedAt: Date | string;
  rank?: number | null;
}): PageIndexDocumentCard {
  const meta = readMeta(row.metadata);
  const updatedAt =
    typeof row.updatedAt === 'string' ? row.updatedAt : row.updatedAt.toISOString();
  const card: PageIndexDocumentCard = {
    id: row.id,
    document_id: row.documentId,
    knowledge_base_id: row.knowledgeBaseId,
    document_name: row.documentName,
    channel_path: row.channelPath,
    abstract: meta.abstract,
    tags: meta.tags,
    categories: meta.categories,
    author: meta.author,
    source: meta.source,
    publish_date: meta.publish_date,
    page_count: row.pageCount,
    page_index_strategy: row.pageIndexStrategy,
    markdown_complete: row.markdownComplete,
    updated_at: updatedAt,
  };
  if (row.rank != null && Number.isFinite(Number(row.rank))) {
    card.rank = Number(row.rank);
  }
  return card;
}

function toItemRecord(row: {
  item: typeof appKbItems.$inferSelect;
  fileType: string | null;
}): PageIndexItemRecord {
  return {
    id: row.item.id,
    knowledgeBaseId: row.item.knowledgeBaseId,
    documentId: row.item.documentId,
    documentName: row.item.documentName,
    channelPath: row.item.channelPath,
    originalS3Key: row.item.originalS3Key,
    metadata: row.item.metadata,
    pageIndex: row.item.pageIndex,
    markdown: row.item.markdown,
    parsingResult: row.item.parsingResult,
    tocTitles: row.item.tocTitles,
    pageCount: row.item.pageCount,
    pageIndexStrategy: row.item.pageIndexStrategy,
    markdownComplete: row.item.markdownComplete,
    updatedAt: row.item.updatedAt,
    fileType: row.fileType,
  };
}

type BrowseSqlRow = {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  document_name: string;
  channel_path: string;
  metadata: Record<string, unknown> | null;
  page_count: number | null;
  page_index_strategy: string | null;
  markdown_complete: boolean;
  updated_at: Date | string;
  rank: number | null;
};

function buildFacetClauses(
  input: BrowseDocumentsRequest,
  params: unknown[],
): string[] {
  const clauses: string[] = [];

  if (input.channelPathPrefix?.trim()) {
    const prefix = input.channelPathPrefix.trim();
    params.push(prefix);
    const idx = params.length;
    clauses.push(`(i.channel_path = $${idx} OR i.channel_path LIKE $${idx} || '%')`);
  }

  if (input.tags?.length) {
    params.push(input.tags);
    clauses.push(`(i.metadata->'tags' ?| $${params.length}::text[])`);
  }

  if (input.categories?.length) {
    params.push(input.categories);
    clauses.push(`(i.metadata->'categories' ?| $${params.length}::text[])`);
  }

  if (input.author?.trim()) {
    params.push(input.author.trim());
    clauses.push(`(i.metadata->>'author' = $${params.length})`);
  }

  if (input.source?.trim()) {
    params.push(input.source.trim());
    clauses.push(`(i.metadata->>'source' = $${params.length})`);
  }

  if (input.publishDateFrom?.trim()) {
    params.push(input.publishDateFrom.trim());
    clauses.push(`(i.metadata->>'publish_date' >= $${params.length})`);
  }

  if (input.publishDateTo?.trim()) {
    params.push(input.publishDateTo.trim());
    clauses.push(`(i.metadata->>'publish_date' <= $${params.length})`);
  }

  return clauses;
}

export function createDrizzlePageIndexItemStore(): PageIndexItemStore {
  return {
    async listPageIndexKnowledgeBases(ids) {
      if (ids && ids.length === 0) return [];

      const rows = await db
        .select({
          id: appKnowledgeBases.id,
          name: appKnowledgeBases.name,
          description: appKnowledgeBases.description,
          updatedAt: appKnowledgeBases.updatedAt,
        })
        .from(appKnowledgeBases)
        .where(
          ids && ids.length > 0
            ? and(eq(appKnowledgeBases.type, 'page_index'), inArray(appKnowledgeBases.id, ids))
            : eq(appKnowledgeBases.type, 'page_index'),
        )
        .orderBy(desc(appKnowledgeBases.updatedAt));

      return rows.map(
        (row): PageIndexKnowledgeBase => ({
          id: row.id,
          name: row.name,
          type: 'page_index',
          description: row.description,
          updated_at: row.updatedAt.toISOString(),
        }),
      );
    },

    async browseDocuments(input) {
      if (input.kbIds.length === 0) {
        return {
          items: [],
          limit: input.limit,
          offset: input.offset,
          sort: input.sort,
          query: input.query?.trim() || null,
        };
      }

      const pool = getPool();
      const params: unknown[] = [input.kbIds];
      const where: string[] = [
        `i.knowledge_base_id = ANY($1::uuid[])`,
        `i.import_status = 'completed'`,
      ];
      where.push(...buildFacetClauses(input, params));

      const query = input.query?.trim() || '';
      const useRelevance = input.sort === 'relevance' && query.length > 0;
      let rankSelect = 'NULL::float8 AS rank';
      if (useRelevance) {
        params.push(query);
        const qIdx = params.length;
        where.push(`i.search_vector @@ plainto_tsquery('simple', $${qIdx})`);
        rankSelect = `ts_rank_cd(i.search_vector, plainto_tsquery('simple', $${qIdx}))::float8 AS rank`;
      }

      params.push(input.limit);
      const limitIdx = params.length;
      params.push(input.offset);
      const offsetIdx = params.length;

      const orderBy = useRelevance
        ? 'rank DESC NULLS LAST, i.updated_at DESC'
        : 'i.updated_at DESC';

      const sql = `
        SELECT i.id,
               i.document_id,
               i.knowledge_base_id,
               i.document_name,
               i.channel_path,
               i.metadata,
               i.page_count,
               i.page_index_strategy,
               i.markdown_complete,
               i.updated_at,
               ${rankSelect}
        FROM app_kb_items i
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${limitIdx}
        OFFSET $${offsetIdx}
      `;

      const result = await pool.query<BrowseSqlRow>(sql, params);
      const items = result.rows.map((row) =>
        toCard({
          id: row.id,
          documentId: row.document_id,
          knowledgeBaseId: row.knowledge_base_id,
          documentName: row.document_name,
          channelPath: row.channel_path,
          metadata: row.metadata,
          pageCount: row.page_count,
          pageIndexStrategy: row.page_index_strategy,
          markdownComplete: row.markdown_complete,
          updatedAt: row.updated_at,
          rank: row.rank,
        }),
      );

      const response: BrowseDocumentsResponse = {
        items,
        limit: input.limit,
        offset: input.offset,
        sort: input.sort,
        query: query || null,
      };
      return response;
    },

    async getItem(kbId, documentId) {
      const [row] = await db
        .select({
          item: appKbItems,
          fileType: appDocuments.fileType,
        })
        .from(appKbItems)
        .leftJoin(appDocuments, eq(appDocuments.id, appKbItems.documentId))
        .where(and(eq(appKbItems.knowledgeBaseId, kbId), eq(appKbItems.documentId, documentId)))
        .limit(1);
      return row ? toItemRecord(row) : null;
    },

    async getItemByDocumentId(documentId) {
      const [row] = await db
        .select({
          item: appKbItems,
          fileType: appDocuments.fileType,
        })
        .from(appKbItems)
        .leftJoin(appDocuments, eq(appDocuments.id, appKbItems.documentId))
        .where(eq(appKbItems.documentId, documentId))
        .limit(1);
      return row ? toItemRecord(row) : null;
    },
  };
}

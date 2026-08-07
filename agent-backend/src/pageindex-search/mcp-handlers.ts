import type { AuthUser } from '../auth/jwt.ts';
import {
  KNOWLEDGE_MANAGEMENT_CATEGORY,
  KNOWLEDGE_MANAGEMENT_RESOURCES,
} from '../auth/rbac-catalog.ts';
import { redactSandboxSecrets } from '../sandboxes/sandbox-secret-redact.ts';
import type { PageIndexSearchService } from './service.ts';

function jsonText(payload: unknown): string {
  return redactSandboxSecrets(JSON.stringify(payload, null, 2));
}

export type PageIndexSearchMcpAuth = {
  assertRead: (user: AuthUser) => Promise<void>;
  listVisibleKbIds: (userId: string) => Promise<Set<string>>;
};

async function defaultAssertRead(user: AuthUser): Promise<void> {
  const { userHasResourcePermission } = await import('../auth/rbac.ts');
  const allowed = await userHasResourcePermission(
    user.id,
    KNOWLEDGE_MANAGEMENT_CATEGORY,
    KNOWLEDGE_MANAGEMENT_RESOURCES.PAGEINDEX_SEARCH,
    'read',
  );
  if (!allowed) {
    throw new Error('Forbidden');
  }
}

async function defaultListVisibleKbIds(userId: string): Promise<Set<string>> {
  const { listAccessibleKnowledgeBaseIds } = await import('../auth/resource-access.ts');
  return listAccessibleKnowledgeBaseIds(userId);
}

const defaultAuth: PageIndexSearchMcpAuth = {
  assertRead: defaultAssertRead,
  listVisibleKbIds: defaultListVisibleKbIds,
};

function resolveKbIds(inputKbIds: string[] | undefined, visibleIds: Set<string>): string[] {
  const visible = [...visibleIds];
  if (!visible.length) {
    throw new Error('No PageIndex knowledge bases visible to this user.');
  }
  if (!inputKbIds?.length) return visible;
  const illegal = inputKbIds.filter((id) => !visibleIds.has(id));
  if (illegal.length > 0) {
    throw new Error(
      `Knowledge base IDs not visible or invalid: ${illegal.join(', ')}. Re-run list_knowledge_bases.`,
    );
  }
  return inputKbIds;
}

export type PageIndexSearchMcpHandlers = {
  listKnowledgeBases: () => Promise<string>;
  browseDocuments: (input: BrowseDocumentsMcpInput) => Promise<string>;
  searchDocuments: (input: SearchDocumentsMcpInput) => Promise<string>;
  getDocument: (input: { kb_id: string; document_id: string }) => Promise<string>;
  getDocumentStructure: (input: GetDocumentStructureMcpInput) => Promise<string>;
  getSectionContent: (input: GetSectionContentMcpInput) => Promise<string>;
};

export type BrowseDocumentsMcpInput = {
  kb_ids?: string[];
  channel_path_prefix?: string;
  tags?: string[];
  categories?: string[];
  author?: string;
  source?: string;
  publish_date_from?: string;
  publish_date_to?: string;
  query?: string;
  sort?: 'time' | 'relevance';
  limit?: number;
  offset?: number;
};

export type SearchDocumentsMcpInput = Omit<BrowseDocumentsMcpInput, 'sort' | 'query'> & {
  query: string;
};

export type GetDocumentStructureMcpInput = {
  kb_id: string;
  document_id: string;
  max_depth?: number;
  part?: string;
};

export type GetSectionContentMcpInput = {
  kb_id: string;
  document_id: string;
  node_id?: string;
  start_page?: number;
  end_page?: number;
  start_line?: number;
  end_line?: number;
  max_chars?: number;
};

export function createPageIndexSearchMcpHandlers(
  user: AuthUser,
  service: PageIndexSearchService,
  auth: PageIndexSearchMcpAuth = defaultAuth,
): PageIndexSearchMcpHandlers {
  async function visiblePageIndexIds(): Promise<Set<string>> {
    const aclIds = await auth.listVisibleKbIds(user.id);
    const pageIndexVisible = await service.listKnowledgeBases([...aclIds]);
    return new Set(pageIndexVisible.map((item) => item.id));
  }

  return {
    async listKnowledgeBases() {
      await auth.assertRead(user);
      const visibleIds = await auth.listVisibleKbIds(user.id);
      const items = await service.listKnowledgeBases([...visibleIds]);
      return jsonText({
        visible_ids: items.map((item) => item.id),
        items,
      });
    },

    async browseDocuments(input) {
      await auth.assertRead(user);
      const pageIndexVisibleIds = await visiblePageIndexIds();
      const kbIds = resolveKbIds(input.kb_ids, pageIndexVisibleIds);

      const result = await service.browseDocuments({
        kbIds,
        channelPathPrefix: input.channel_path_prefix,
        tags: input.tags,
        categories: input.categories,
        author: input.author,
        source: input.source,
        publishDateFrom: input.publish_date_from,
        publishDateTo: input.publish_date_to,
        query: input.query,
        sort: input.sort,
        limit: input.limit,
        offset: input.offset,
      });
      return jsonText(result);
    },

    async searchDocuments(input) {
      await auth.assertRead(user);
      const pageIndexVisibleIds = await visiblePageIndexIds();
      const kbIds = resolveKbIds(input.kb_ids, pageIndexVisibleIds);

      const result = await service.searchDocuments({
        kbIds,
        channelPathPrefix: input.channel_path_prefix,
        tags: input.tags,
        categories: input.categories,
        author: input.author,
        source: input.source,
        publishDateFrom: input.publish_date_from,
        publishDateTo: input.publish_date_to,
        query: input.query,
        limit: input.limit,
        offset: input.offset,
      });
      return jsonText(result);
    },

    async getDocument(input) {
      await auth.assertRead(user);
      const pageIndexVisibleIds = await visiblePageIndexIds();
      if (!pageIndexVisibleIds.has(input.kb_id)) {
        throw new Error(
          `Knowledge base IDs not visible or invalid: ${input.kb_id}. Re-run list_knowledge_bases.`,
        );
      }
      const result = await service.getDocument(input.kb_id, input.document_id, pageIndexVisibleIds);
      return jsonText(result);
    },

    async getDocumentStructure(input) {
      await auth.assertRead(user);
      const pageIndexVisibleIds = await visiblePageIndexIds();
      if (!pageIndexVisibleIds.has(input.kb_id)) {
        throw new Error(
          `Knowledge base IDs not visible or invalid: ${input.kb_id}. Re-run list_knowledge_bases.`,
        );
      }
      const result = await service.getDocumentStructure(input.kb_id, input.document_id, {
        maxDepth: input.max_depth,
        part: input.part,
      });
      return jsonText(result);
    },

    async getSectionContent(input) {
      await auth.assertRead(user);
      const pageIndexVisibleIds = await visiblePageIndexIds();
      if (!pageIndexVisibleIds.has(input.kb_id)) {
        throw new Error(
          `Knowledge base IDs not visible or invalid: ${input.kb_id}. Re-run list_knowledge_bases.`,
        );
      }

      const pages =
        input.start_page != null
          ? { start: input.start_page, end: input.end_page }
          : undefined;
      const lines =
        input.start_line != null
          ? { start: input.start_line, end: input.end_line }
          : undefined;

      const result = await service.getSectionContent(input.kb_id, input.document_id, {
        nodeId: input.node_id,
        pages,
        lines,
        maxChars: input.max_chars,
      });
      return jsonText(result);
    },
  };
}

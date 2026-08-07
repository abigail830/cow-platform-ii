import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../auth/jwt.ts';
import {
  createPageIndexSearchMcpHandlers,
  type PageIndexSearchMcpAuth,
} from './mcp-handlers.ts';
import type { PageIndexSearchService } from './service.ts';

const user: AuthUser = {
  id: 'user-1',
  email: 'u@example.com',
  displayName: 'User',
  role: 'admin',
};

const kbId = '11111111-1111-1111-1111-111111111111';

function mockAuth(options?: {
  allowed?: boolean;
  visibleIds?: string[];
}): PageIndexSearchMcpAuth {
  return {
    assertRead: async () => {
      if (options?.allowed === false) throw new Error('Forbidden');
    },
    listVisibleKbIds: async () => new Set(options?.visibleIds ?? [kbId]),
  };
}

function mockService(overrides: Partial<PageIndexSearchService> = {}): PageIndexSearchService {
  const base = {
    listKnowledgeBases: async (ids?: string[]) => {
      const all = [
        {
          id: kbId,
          name: 'PI KB',
          type: 'page_index' as const,
          description: null,
          updated_at: new Date(0).toISOString(),
        },
      ];
      if (!ids) return all;
      const allowed = new Set(ids);
      return all.filter((item) => allowed.has(item.id));
    },
    browseDocuments: async () => ({
      items: [],
      limit: 20,
      offset: 0,
      sort: 'time' as const,
      query: null,
    }),
    searchDocuments: async () => ({
      items: [],
      limit: 20,
      offset: 0,
      sort: 'relevance' as const,
      query: 'q',
    }),
    getDocument: async () => {
      throw new Error('not used');
    },
    getDocumentStructure: async () => {
      throw new Error('not used');
    },
    getSectionContent: async () => {
      throw new Error('not used');
    },
  };
  return { ...base, ...overrides } as PageIndexSearchService;
}

describe('createPageIndexSearchMcpHandlers', () => {
  it('listKnowledgeBases returns visible_ids from service', async () => {
    const handlers = createPageIndexSearchMcpHandlers(user, mockService(), mockAuth());
    const text = await handlers.listKnowledgeBases();
    const payload = JSON.parse(text) as { visible_ids: string[]; items: unknown[] };
    assert.deepEqual(payload.visible_ids, [kbId]);
    assert.equal(payload.items.length, 1);
  });

  it('browseDocuments rejects kb_ids outside visible page_index set', async () => {
    const handlers = createPageIndexSearchMcpHandlers(user, mockService(), mockAuth());
    await assert.rejects(
      () =>
        handlers.browseDocuments({
          kb_ids: ['22222222-2222-2222-2222-222222222222'],
        }),
      /not visible or invalid/,
    );
  });

  it('searchDocuments forwards to service with resolved kb ids', async () => {
    let seenKbIds: string[] | undefined;
    const handlers = createPageIndexSearchMcpHandlers(
      user,
      mockService({
        searchDocuments: async (input) => {
          seenKbIds = input.kbIds;
          return {
            items: [],
            limit: 20,
            offset: 0,
            sort: 'relevance',
            query: input.query,
          };
        },
      }),
      mockAuth(),
    );
    const text = await handlers.searchDocuments({ query: 'leave policy' });
    const payload = JSON.parse(text) as { query: string };
    assert.equal(payload.query, 'leave policy');
    assert.deepEqual(seenKbIds, [kbId]);
  });

  it('forbidden when permission check fails', async () => {
    const handlers = createPageIndexSearchMcpHandlers(
      user,
      mockService(),
      mockAuth({ allowed: false }),
    );
    await assert.rejects(() => handlers.listKnowledgeBases(), /Forbidden/);
  });
});

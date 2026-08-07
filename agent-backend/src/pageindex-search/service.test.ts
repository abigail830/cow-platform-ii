import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPageIndexSearchService } from './service.ts';
import type { PageIndexItemRecord, PageIndexItemStore } from './ports.ts';

const kbId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const docId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleMarkdown = [
  '# Intro',
  'Welcome to the widget guide.',
  '',
  '# Methods',
  'Use protocol Alpha for evaluation.',
  'Details on Alpha follow.',
  '',
  '# Results',
  'Alpha works well.',
].join('\n');

const sampleItem: PageIndexItemRecord = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  knowledgeBaseId: kbId,
  documentId: docId,
  documentName: 'Widget Guide.md',
  channelPath: 'research/widgets',
  originalS3Key: 'docs/hash/original.pdf',
  metadata: {
    abstract: 'A guide to widget evaluation protocols.',
    tags: ['widgets'],
    categories: ['research'],
  },
  pageIndex: {
    strategy: 'markdown-headings',
    structure: [
      {
        title: 'Intro',
        node_id: '0001',
        line_num: 1,
        summary: 'Welcome overview',
        nodes: [],
      },
      {
        title: 'Methods',
        node_id: '0002',
        line_num: 4,
        summary: 'Protocol Alpha',
        nodes: [],
      },
      {
        title: 'Results',
        node_id: '0003',
        line_num: 8,
        summary: 'Alpha works',
        nodes: [],
      },
    ],
  },
  markdown: sampleMarkdown,
  parsingResult: { page_count: 3 },
  tocTitles: ['Intro', 'Methods', 'Results'],
  pageCount: 3,
  pageIndexStrategy: 'markdown-headings',
  markdownComplete: true,
  fileType: 'MD',
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

function mockStore(item: PageIndexItemRecord = sampleItem): PageIndexItemStore {
  return {
    listPageIndexKnowledgeBases: async (ids) => {
      if (ids && !ids.includes(kbId)) return [];
      return [
        {
          id: kbId,
          name: 'PageIndex KB',
          type: 'page_index',
          description: null,
          updated_at: item.updatedAt.toISOString(),
        },
      ];
    },
    browseDocuments: async (input) => ({
      items: [
        {
          id: item.id,
          document_id: item.documentId,
          knowledge_base_id: item.knowledgeBaseId,
          document_name: item.documentName,
          channel_path: item.channelPath,
          abstract: typeof item.metadata?.abstract === 'string' ? item.metadata.abstract : null,
          tags: Array.isArray(item.metadata?.tags) ? (item.metadata.tags as string[]) : [],
          categories: Array.isArray(item.metadata?.categories)
            ? (item.metadata.categories as string[])
            : [],
          author: null,
          source: null,
          publish_date: null,
          page_count: item.pageCount,
          page_index_strategy: item.pageIndexStrategy,
          markdown_complete: item.markdownComplete,
          updated_at: item.updatedAt.toISOString(),
          rank: input.sort === 'relevance' ? 0.9 : undefined,
        },
      ],
      total: 1,
      limit: input.limit ?? 20,
      offset: input.offset ?? 0,
    }),
    getItem: async (knowledgeBaseId, documentId) => {
      if (knowledgeBaseId === item.knowledgeBaseId && documentId === item.documentId) return item;
      return null;
    },
    getItemByDocumentId: async (documentId) => {
      if (documentId === item.documentId) return item;
      return null;
    },
  };
}

describe('createPageIndexSearchService', () => {
  it('lists only page_index knowledge bases for visible ids', async () => {
    const service = createPageIndexSearchService({ itemStore: mockStore() });
    const kbs = await service.listKnowledgeBases([kbId]);
    assert.equal(kbs.length, 1);
    assert.equal(kbs[0]?.type, 'page_index');
  });

  it('returns document cards without full markdown', async () => {
    const service = createPageIndexSearchService({ itemStore: mockStore() });
    const result = await service.searchDocuments({
      kbIds: [kbId],
      query: 'widget evaluation',
      sort: 'relevance',
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.abstract?.includes('widget'), true);
    assert.ok(!('markdown' in result.items[0]!));
  });

  it('slices section by node_id with citation', async () => {
    const service = createPageIndexSearchService({ itemStore: mockStore() });
    const section = await service.getSectionContent(kbId, docId, { nodeId: '0002' });
    assert.match(section.content, /protocol Alpha/);
    assert.equal(section.locator?.node_id, '0002');
    assert.ok(section.source.citation_markdown.includes('Widget Guide'));
    assert.ok(section.source.preview_url.includes('node=0002'));
  });

  it('returns structure with summaries for agent reasoning', async () => {
    const service = createPageIndexSearchService({ itemStore: mockStore() });
    const structure = await service.getDocumentStructure(kbId, docId, { maxDepth: 2 });
    assert.equal(structure.strategy, 'markdown-headings');
    assert.equal(structure.structure[1]?.summary, 'Protocol Alpha');
  });
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthUser } from '../auth/jwt.ts';
import { createDefaultPageIndexSearchService } from '../pageindex-search/default-deps.ts';
import {
  createPageIndexSearchMcpHandlers,
  type PageIndexSearchMcpHandlers,
} from '../pageindex-search/mcp-handlers.ts';
import {
  BROWSE_DOCUMENTS_MCP_DESCRIPTION,
  GET_DOCUMENT_MCP_DESCRIPTION,
  GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION,
  GET_SECTION_CONTENT_MCP_DESCRIPTION,
  LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
  SEARCH_DOCUMENTS_MCP_DESCRIPTION,
} from '../pageindex-search/mcp-tool-descriptions.ts';

export function createPageIndexSearchMcpServer(
  user: AuthUser,
  handlers: PageIndexSearchMcpHandlers = createPageIndexSearchMcpHandlers(
    user,
    createDefaultPageIndexSearchService(),
  ),
): McpServer {
  const server = new McpServer({
    name: 'pageindex-search',
    version: '1.0.0',
  });

  server.registerTool(
    'list_knowledge_bases',
    {
      title: 'List PageIndex knowledge bases',
      description: LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
      inputSchema: {},
    },
    async () => {
      const text = await handlers.listKnowledgeBases();
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'browse_documents',
    {
      title: 'Browse PageIndex documents',
      description: BROWSE_DOCUMENTS_MCP_DESCRIPTION,
      inputSchema: {
        kb_ids: z
          .array(z.string().uuid())
          .optional()
          .describe('Subset of visible_ids from list_knowledge_bases; default all visible'),
        channel_path_prefix: z.string().optional().describe('Facet: channel_path prefix or exact'),
        tags: z.array(z.string()).optional().describe('Facet: metadata tags (any match)'),
        categories: z.array(z.string()).optional().describe('Facet: metadata categories (any match)'),
        author: z.string().optional().describe('Facet: exact author'),
        source: z.string().optional().describe('Facet: exact source'),
        publish_date_from: z.string().optional().describe('Facet: publish_date >= YYYY-MM-DD'),
        publish_date_to: z.string().optional().describe('Facet: publish_date <= YYYY-MM-DD'),
        query: z.string().optional().describe('Optional lexical query (use with sort=relevance)'),
        sort: z.enum(['time', 'relevance']).optional().describe('time (default) or relevance'),
        limit: z.number().int().min(1).max(50).optional().describe('Page size (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination'),
      },
    },
    async (input) => {
      const text = await handlers.browseDocuments(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'search_documents',
    {
      title: 'Search PageIndex documents',
      description: SEARCH_DOCUMENTS_MCP_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Standalone keyword query for discovery FTS (rewrite contextual follow-ups)'),
        kb_ids: z
          .array(z.string().uuid())
          .optional()
          .describe('Subset of visible_ids from list_knowledge_bases; default all visible'),
        channel_path_prefix: z.string().optional().describe('Facet: channel_path prefix or exact'),
        tags: z.array(z.string()).optional().describe('Facet: metadata tags (any match)'),
        categories: z.array(z.string()).optional().describe('Facet: metadata categories (any match)'),
        author: z.string().optional().describe('Facet: exact author'),
        source: z.string().optional().describe('Facet: exact source'),
        publish_date_from: z.string().optional().describe('Facet: publish_date >= YYYY-MM-DD'),
        publish_date_to: z.string().optional().describe('Facet: publish_date <= YYYY-MM-DD'),
        limit: z.number().int().min(1).max(50).optional().describe('Page size (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination'),
      },
    },
    async (input) => {
      const text = await handlers.searchDocuments(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'get_document',
    {
      title: 'Get PageIndex document',
      description: GET_DOCUMENT_MCP_DESCRIPTION,
      inputSchema: {
        kb_id: z.string().uuid().describe('PageIndex knowledge base id from list_knowledge_bases'),
        document_id: z.string().uuid().describe('Document id from browse/search cards'),
      },
    },
    async (input) => {
      const text = await handlers.getDocument(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'get_document_structure',
    {
      title: 'Get PageIndex document structure',
      description: GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION,
      inputSchema: {
        kb_id: z.string().uuid(),
        document_id: z.string().uuid(),
        max_depth: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Max nesting depth of nodes to return'),
        part: z.string().optional().describe('Optional node_id to zoom into a subtree'),
      },
    },
    async (input) => {
      const text = await handlers.getDocumentStructure(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'get_section_content',
    {
      title: 'Get PageIndex section content',
      description: GET_SECTION_CONTENT_MCP_DESCRIPTION,
      inputSchema: {
        kb_id: z.string().uuid(),
        document_id: z.string().uuid(),
        node_id: z.string().optional().describe('Preferred: page_index node_id from structure'),
        start_page: z.number().int().min(1).optional().describe('Page range start (1-based)'),
        end_page: z.number().int().min(1).optional().describe('Page range end (inclusive)'),
        start_line: z.number().int().min(1).optional().describe('Line range start (1-based)'),
        end_line: z.number().int().min(1).optional().describe('Line range end (exclusive next start)'),
        max_chars: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Hard max characters (default 12000)'),
      },
    },
    async (input) => {
      const text = await handlers.getSectionContent(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  return server;
}

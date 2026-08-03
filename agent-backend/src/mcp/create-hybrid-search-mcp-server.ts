import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthUser } from '../auth/jwt.ts';
import {
  createHybridSearchMcpHandlers,
  type HybridSearchMcpHandlers,
} from '../hybrid-search/mcp-handlers.ts';
import {
  HYBRID_SEARCH_MCP_DESCRIPTION,
  LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
} from '../hybrid-search/mcp-tool-descriptions.ts';

export function createHybridSearchMcpServer(
  user: AuthUser,
  handlers: HybridSearchMcpHandlers = createHybridSearchMcpHandlers(user),
): McpServer {
  const server = new McpServer({
    name: 'hybrid-search',
    version: '1.0.0',
  });

  server.registerTool(
    'list_knowledge_bases',
    {
      title: 'List knowledge bases',
      description: LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
      inputSchema: {
        group_by_embedding: z
          .boolean()
          .optional()
          .describe('Group results by embedding_model_config_id'),
      },
    },
    async (input) => {
      const text = await handlers.listKnowledgeBases(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'hybrid_search',
    {
      title: 'Hybrid search',
      description: HYBRID_SEARCH_MCP_DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Standalone retrieval query (rewrite when user message needs conversation context)'),
        kb_ids: z
          .array(z.string().uuid())
          .optional()
          .describe('Subset of visible_ids from list_knowledge_bases; default all visible'),
        top_k: z.number().int().min(1).optional().describe('Max hits to return (default 10)'),
        search_type: z
          .enum(['all', 'chunks', 'faqs'])
          .optional()
          .describe('all=chunks+faqs, chunks=RAG only, faqs=FAQ only'),
        recall_k: z.number().int().min(1).optional().describe('Per-leg recall before fusion (default 25)'),
        rrf_k: z.number().int().min(1).optional().describe('RRF constant (default 60)'),
        no_bm25: z.boolean().optional().describe('true disables BM25 leg'),
        rerank_model_id: z.string().uuid().optional().describe('Optional rerank model config id'),
      },
    },
    async (input) => {
      const text = await handlers.hybridSearch(input);
      return { content: [{ type: 'text', text }] };
    },
  );

  return server;
}

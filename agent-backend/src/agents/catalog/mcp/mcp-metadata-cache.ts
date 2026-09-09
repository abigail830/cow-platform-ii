import { defineTool, type ToolDefinition } from '@flue/runtime';
import * as v from 'valibot';
import {
  HYBRID_SEARCH_MCP_DESCRIPTION,
  LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
} from '../../../tools/hybrid-search/mcp-tool-descriptions.ts';
import {
  BROWSE_DOCUMENTS_MCP_DESCRIPTION,
  GET_DOCUMENT_MCP_DESCRIPTION,
  GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION,
  GET_SECTION_CONTENT_MCP_DESCRIPTION,
  LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION as PAGEINDEX_LIST_KB_DESCRIPTION,
  SEARCH_DOCUMENTS_MCP_DESCRIPTION,
} from '../../../tools/pageindex-search/mcp-tool-descriptions.ts';
import { DATABASE_MCP_STATIC_TOOLS } from '../../../tools/database-mcp/constants.ts';
import { filterMcpToolsByName } from './tool-filter.ts';

export type McpToolMetadata = Pick<ToolDefinition, 'name' | 'description' | 'input' | 'output'>;

function flueToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

function hybridSearchTools(): McpToolMetadata[] {
  return [
    defineTool({
      name: flueToolName('hybrid-search', 'list_knowledge_bases'),
      description: LIST_KNOWLEDGE_BASES_MCP_DESCRIPTION,
      input: v.object({
        group_by_embedding: v.optional(
          v.pipe(v.boolean(), v.description('Group results by embedding_model_config_id')),
        ),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('hybrid-search', 'hybrid_search'),
      description: HYBRID_SEARCH_MCP_DESCRIPTION,
      input: v.object({
        query: v.pipe(
          v.string(),
          v.description(
            'Standalone retrieval query (rewrite when user message needs conversation context)',
          ),
        ),
        kb_ids: v.optional(
          v.pipe(
            v.array(v.string()),
            v.description('Subset of visible_ids from list_knowledge_bases; default all visible'),
          ),
        ),
        top_k: v.optional(v.pipe(v.number(), v.description('Max hits to return (default 10)'))),
        search_type: v.optional(
          v.pipe(
            v.picklist(['all', 'chunks', 'faqs']),
            v.description('all=chunks+faqs, chunks=RAG only, faqs=FAQ only'),
          ),
        ),
        recall_k: v.optional(
          v.pipe(v.number(), v.description('Per-leg recall before fusion (default 25)')),
        ),
        rrf_k: v.optional(v.pipe(v.number(), v.description('RRF constant (default 60)'))),
        no_bm25: v.optional(v.pipe(v.boolean(), v.description('true disables BM25 leg'))),
        rerank_model_id: v.optional(
          v.pipe(v.string(), v.description('Optional rerank model config id')),
        ),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
  ];
}

function pageIndexSearchTools(): McpToolMetadata[] {
  return [
    defineTool({
      name: flueToolName('pageindex-search', 'list_knowledge_bases'),
      description: PAGEINDEX_LIST_KB_DESCRIPTION,
      input: v.object({}),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('pageindex-search', 'browse_documents'),
      description: BROWSE_DOCUMENTS_MCP_DESCRIPTION,
      input: v.object({
        kb_ids: v.optional(v.array(v.string())),
        channel_path_prefix: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        categories: v.optional(v.array(v.string())),
        author: v.optional(v.string()),
        source: v.optional(v.string()),
        publish_date_from: v.optional(v.string()),
        publish_date_to: v.optional(v.string()),
        query: v.optional(v.string()),
        sort: v.optional(v.picklist(['time', 'relevance'])),
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('pageindex-search', 'search_documents'),
      description: SEARCH_DOCUMENTS_MCP_DESCRIPTION,
      input: v.object({
        query: v.pipe(v.string(), v.description('Standalone keyword query')),
        kb_ids: v.optional(v.array(v.string())),
        channel_path_prefix: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        categories: v.optional(v.array(v.string())),
        author: v.optional(v.string()),
        source: v.optional(v.string()),
        publish_date_from: v.optional(v.string()),
        publish_date_to: v.optional(v.string()),
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('pageindex-search', 'get_document'),
      description: GET_DOCUMENT_MCP_DESCRIPTION,
      input: v.object({
        kb_id: v.pipe(v.string(), v.description('PageIndex knowledge base id')),
        document_id: v.pipe(v.string(), v.description('Document id from browse/search cards')),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('pageindex-search', 'get_document_structure'),
      description: GET_DOCUMENT_STRUCTURE_MCP_DESCRIPTION,
      input: v.object({
        kb_id: v.string(),
        document_id: v.string(),
        max_depth: v.optional(v.number()),
        part: v.optional(v.string()),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
    defineTool({
      name: flueToolName('pageindex-search', 'get_section_content'),
      description: GET_SECTION_CONTENT_MCP_DESCRIPTION,
      input: v.object({
        kb_id: v.string(),
        document_id: v.string(),
        node_id: v.optional(v.string()),
        start_page: v.optional(v.number()),
        end_page: v.optional(v.number()),
        start_line: v.optional(v.number()),
        end_line: v.optional(v.number()),
        max_chars: v.optional(v.number()),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
  ];
}

function zhipuWebSearchTools(): McpToolMetadata[] {
  return [
    defineTool({
      name: flueToolName('zhipu-web-search', 'web_search_prime'),
      description:
        'Search the public web when organizational knowledge bases are insufficient or may be stale. Returns page titles and URLs.',
      input: v.object({
        query: v.pipe(v.string(), v.description('Focused web search query')),
      }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
  ];
}

function datasourceTools(serverName: string): McpToolMetadata[] {
  return DATABASE_MCP_STATIC_TOOLS.map((tool) =>
    defineTool({
      name: flueToolName(serverName, tool.name),
      description: tool.description,
      input:
        tool.name === 'list_tables'
          ? v.object({})
          : tool.name === 'describe_table'
            ? v.object({
                table: v.pipe(
                  v.string(),
                  v.description('Table name, optionally schema.table'),
                ),
              })
            : v.object({
                sql: v.pipe(v.string(), v.description('Single read-only SQL statement')),
              }),
      run() {
        throw new Error('Deferred MCP tool — connect on first invocation.');
      },
    }),
  );
}

const STATIC_BY_SERVER: Record<string, () => McpToolMetadata[]> = {
  'hybrid-search': hybridSearchTools,
  'pageindex-search': pageIndexSearchTools,
  'zhipu-web-search': zhipuWebSearchTools,
};

export function getStaticMcpToolMetadata(
  serverName: string,
  allowTools?: string[],
): McpToolMetadata[] {
  const factory = STATIC_BY_SERVER[serverName];
  if (!factory) return [];
  return filterMcpToolsByName(factory(), allowTools);
}

export function getDatasourceMcpToolMetadata(
  datasourceName: string,
  allowTools?: string[],
): McpToolMetadata[] {
  return filterMcpToolsByName(datasourceTools(datasourceName), allowTools);
}

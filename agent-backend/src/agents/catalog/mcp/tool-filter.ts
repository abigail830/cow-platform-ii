import type { McpServerConnection, ToolDefinition } from '@flue/runtime';
import type { McpToolMetadata } from './mcp-metadata-cache.ts';

export function filterMcpTools(
  connection: McpServerConnection,
  allowTools?: string[],
): ToolDefinition[] {
  return filterMcpToolsByName(connection.tools, allowTools, connection.name);
}

export function filterMcpToolsByName(
  tools: McpToolMetadata[] | ToolDefinition[],
  allowTools?: string[],
  serverNameForError?: string,
): ToolDefinition[] {
  if (!allowTools?.length) return tools as ToolDefinition[];
  const allowed = new Set(allowTools);
  const filtered = tools.filter((tool) => allowed.has(tool.name)) as ToolDefinition[];
  if (filtered.length === 0) {
    const label = serverNameForError ? `MCP server "${serverNameForError}"` : 'MCP tools';
    throw new Error(`${label} has no tools matching allowTools: ${allowTools.join(', ')}`);
  }
  return filtered;
}

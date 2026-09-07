import type { McpServerConnection, ToolDefinition } from '@flue/runtime';

export function filterMcpTools(
  connection: McpServerConnection,
  allowTools?: string[],
): ToolDefinition[] {
  if (!allowTools?.length) return connection.tools;
  const allowed = new Set(allowTools);
  const filtered = connection.tools.filter((tool) => allowed.has(tool.name));
  if (filtered.length === 0) {
    throw new Error(
      `MCP server "${connection.name}" has no tools matching allowTools: ${allowTools.join(', ')}`,
    );
  }
  return filtered;
}

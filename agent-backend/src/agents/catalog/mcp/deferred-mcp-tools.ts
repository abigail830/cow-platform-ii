import { defineTool, type ToolDefinition } from '@flue/runtime';
import type { McpToolMetadata } from './mcp-metadata-cache.ts';
import type { McpConnectFn } from './mcp-lifecycle-manager.ts';
import {
  ensureMcpConnection,
  McpServerUnavailableError,
  trackMcpCallEnd,
  trackMcpCallStart,
} from './mcp-lifecycle-manager.ts';
import type { McpLifecycleMode } from './mcp-lifecycle.ts';
import { filterMcpTools } from './tool-filter.ts';

export function wrapDeferredMcpTools(options: {
  scopeKey: string;
  metadataTools: McpToolMetadata[];
  connect: McpConnectFn;
  lifecycle: McpLifecycleMode;
  idleTimeoutMs: number;
  allowTools?: string[];
}): ToolDefinition[] {
  if (options.metadataTools.length === 0) {
    throw new Error(
      `[mcp] No static metadata for lazy server scope "${options.scopeKey}". Add static tool catalog or set lifecycle: eager.`,
    );
  }

  return options.metadataTools.map((template) =>
    defineTool({
      name: template.name,
      description: template.description,
      input: template.input,
      ...(template.output ? { output: template.output } : {}),
      async run(ctx) {
        let connection;
        try {
          connection = await ensureMcpConnection({
            scopeKey: options.scopeKey,
            connect: options.connect,
            lifecycle: options.lifecycle,
            idleTimeoutMs: options.idleTimeoutMs,
          });
        } catch (error) {
          if (error instanceof McpServerUnavailableError) {
            throw error;
          }
          throw new McpServerUnavailableError(
            options.scopeKey,
            error instanceof Error ? error.message : String(error),
          );
        }

        const allowed = filterMcpTools(connection, options.allowTools);
        const realTool = allowed.find((tool) => tool.name === template.name);
        if (!realTool) {
          throw new Error(
            `MCP server scope "${options.scopeKey}" has no tool "${template.name}" after connect.`,
          );
        }

        trackMcpCallStart(options.scopeKey);
        try {
          return await realTool.run(ctx);
        } finally {
          trackMcpCallEnd(options.scopeKey);
        }
      },
    }),
  );
}

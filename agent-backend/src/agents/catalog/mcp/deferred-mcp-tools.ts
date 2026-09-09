import type { ToolDefinition } from '@flue/runtime';
import type { McpToolMetadata } from './mcp-metadata-cache.ts';
import type { McpConnectFn } from './mcp-lifecycle-manager.ts';
import {
  ensureMcpConnection,
  McpServerUnavailableError,
  trackMcpCallEnd,
  trackMcpCallStart,
} from './mcp-lifecycle-manager.ts';
import type { McpLifecycleMode } from './mcp-lifecycle.ts';
import { getPreparedToolAdapter, registerPreparedToolAdapter } from './mcp-prepared-tool.ts';
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

  return options.metadataTools.map((template) => {
    const toolDef: ToolDefinition = {
      name: template.name,
      description: template.description,
      input: template.input,
      ...(template.output ? { output: template.output } : {}),
      run() {
        throw new Error('[flue] Deferred MCP tools execute through the prepared adapter.');
      },
    };

    registerPreparedToolAdapter(toolDef, {
      async execute(args, signal) {
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

        const adapter = getPreparedToolAdapter(realTool);
        if (!adapter) {
          throw new Error(
            `MCP tool "${template.name}" in scope "${options.scopeKey}" has no prepared adapter.`,
          );
        }

        trackMcpCallStart(options.scopeKey);
        try {
          return await adapter.execute(args, signal);
        } finally {
          trackMcpCallEnd(options.scopeKey);
        }
      },
    });

    return Object.freeze(toolDef);
  });
}

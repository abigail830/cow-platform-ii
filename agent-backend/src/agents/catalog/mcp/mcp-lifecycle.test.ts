import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServerConnection, ToolDefinition } from '@flue/runtime';
import * as v from 'valibot';
import { defineTool } from '@flue/runtime';
import { wrapDeferredMcpTools } from './deferred-mcp-tools.ts';
import { getPreparedToolAdapter, registerPreparedToolAdapter } from './mcp-prepared-tool.ts';
import {
  closeAllMcpConnections,
  ensureMcpConnection,
  resetMcpConnectionsForTests,
} from './mcp-lifecycle-manager.ts';
import { buildMcpScopeKey, resolveMcpLifecycle } from './mcp-lifecycle.ts';
import { getStaticMcpToolMetadata } from './mcp-metadata-cache.ts';

function mockConnection(tools: ToolDefinition[]): McpServerConnection {
  return {
    name: 'hybrid-search',
    tools,
    close: async () => undefined,
  };
}

test('resolveMcpLifecycle defaults to lazy', () => {
  assert.equal(resolveMcpLifecycle({}), 'lazy');
  assert.equal(resolveMcpLifecycle({ lifecycle: 'eager' }), 'eager');
});

test('getStaticMcpToolMetadata returns hybrid-search tools without network', () => {
  const tools = getStaticMcpToolMetadata('hybrid-search', [
    'mcp__hybrid-search__hybrid_search',
  ]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, 'mcp__hybrid-search__hybrid_search');
});

test('lazy deferred tool does not connect until run()', async () => {
  resetMcpConnectionsForTests();
  let connectCalls = 0;
  const realTool: ToolDefinition = {
    name: 'mcp__hybrid-search__hybrid_search',
    description: 'search',
    input: v.object({ query: v.string() }),
    async run() {
      throw new Error('MCP stub');
    },
  };
  registerPreparedToolAdapter(realTool, {
    async execute() {
      return JSON.stringify({ ok: true });
    },
  });
  Object.freeze(realTool);

  const deferred = wrapDeferredMcpTools({
    scopeKey: buildMcpScopeKey({ agentId: 'content-studio', userId: 'u1', serverName: 'hybrid-search' }),
    metadataTools: getStaticMcpToolMetadata('hybrid-search', ['mcp__hybrid-search__hybrid_search']),
    connect: async () => {
      connectCalls += 1;
      return mockConnection([realTool]);
    },
    lifecycle: 'lazy',
    idleTimeoutMs: 300_000,
    allowTools: ['mcp__hybrid-search__hybrid_search'],
  });

  assert.equal(connectCalls, 0);
  assert.equal(deferred.length, 1);

  const adapter = getPreparedToolAdapter(deferred[0]!);
  assert.ok(adapter);
  const result = await adapter!.execute({ query: 'policy' });
  assert.deepEqual(JSON.parse(result), { ok: true });
  assert.equal(connectCalls, 1);

  await adapter!.execute({ query: 'policy again' });
  assert.equal(connectCalls, 1);

  await closeAllMcpConnections();
});

test('ensureMcpConnection single-flights concurrent connects', async () => {
  resetMcpConnectionsForTests();
  let connectCalls = 0;
  const scopeKey = buildMcpScopeKey({ agentId: 'kb', userId: 'u2', serverName: 'hybrid-search' });
  const connect = async () => {
    connectCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return mockConnection([]);
  };

  const [a, b] = await Promise.all([
    ensureMcpConnection({ scopeKey, connect, lifecycle: 'lazy', idleTimeoutMs: 300_000 }),
    ensureMcpConnection({ scopeKey, connect, lifecycle: 'lazy', idleTimeoutMs: 300_000 }),
  ]);

  assert.equal(connectCalls, 1);
  assert.equal(a, b);
  await closeAllMcpConnections();
});

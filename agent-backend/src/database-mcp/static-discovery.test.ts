import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATABASE_MCP_STATIC_TOOLS } from './constants.ts';
import { discoverStaticPlatformMcpTools } from './static-discovery.ts';

test('discoverStaticPlatformMcpTools returns catalog for postgres/mysql', () => {
  for (const id of ['postgres', 'mysql'] as const) {
    const result = discoverStaticPlatformMcpTools(id);
    assert.ok(result);
    assert.equal(result.status, 'ok');
    assert.equal(result.tools.length, DATABASE_MCP_STATIC_TOOLS.length);
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      DATABASE_MCP_STATIC_TOOLS.map((tool) => tool.name),
    );
  }
});

test('discoverStaticPlatformMcpTools ignores non-database MCP ids', () => {
  assert.equal(discoverStaticPlatformMcpTools('hybrid-search'), null);
});

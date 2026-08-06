import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test';

const { loadAgentSpec } = await import('./discover.ts');
const { agentCatalogRoot } = await import('./paths.ts');
const { agentRuntimeCacheKey, agentRuntimeNeedsUserScope } = await import('./resolve-agent-runtime.ts');
const { runWithAgentRequestContext } = await import('../flue/agent-request-context.ts');

test('product-analytics needs per-user runtime cache for datasource MCP', () => {
  const analytics = loadAgentSpec(`${agentCatalogRoot()}/product-analytics`);
  assert.equal(agentRuntimeNeedsUserScope(analytics), true);

  const keyA = runWithAgentRequestContext({ userId: 'user-a' }, () =>
    agentRuntimeCacheKey(analytics),
  );
  const keyB = runWithAgentRequestContext({ userId: 'user-b' }, () =>
    agentRuntimeCacheKey(analytics),
  );
  assert.equal(keyA, 'product-analytics::user-a');
  assert.equal(keyB, 'product-analytics::user-b');
  assert.notEqual(keyA, keyB);
});

test('kb-qa uses shared runtime cache', () => {
  const kb = loadAgentSpec(`${agentCatalogRoot()}/kb-qa`);
  assert.equal(agentRuntimeNeedsUserScope(kb), false);
  assert.equal(agentRuntimeCacheKey(kb), 'kb-qa::shared');
});

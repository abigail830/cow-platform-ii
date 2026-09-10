import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isPlatformMcpLoopbackUrl,
  registerInProcessMcpFetch,
  resetInProcessMcpFetchForTests,
  createPlatformMcpFetch,
} from './platform-mcp-loopback-fetch.ts';

test('isPlatformMcpLoopbackUrl matches platform retrieval MCP paths', () => {
  assert.equal(
    isPlatformMcpLoopbackUrl('https://cow-platform-ii.vercel.app/api/mcp/hybrid-search'),
    true,
  );
  assert.equal(
    isPlatformMcpLoopbackUrl('http://127.0.0.1:8787/api/mcp/pageindex-search'),
    true,
  );
  assert.equal(isPlatformMcpLoopbackUrl('https://example.com/api/mcp/postgres'), false);
});

test('createPlatformMcpFetch uses in-process handler for loopback MCP URLs', async () => {
  resetInProcessMcpFetchForTests();
  let inProcessCalled = false;
  registerInProcessMcpFetch(async () => {
    inProcessCalled = true;
    return new Response('ok', { status: 200 });
  });

  const fetchImpl = createPlatformMcpFetch(async () => {
    throw new Error('external fetch should not run');
  });
  const response = await fetchImpl('https://cow-platform-ii.vercel.app/api/mcp/hybrid-search', {
    method: 'POST',
  });
  assert.equal(response.status, 200);
  assert.equal(inProcessCalled, true);
  resetInProcessMcpFetchForTests();
});

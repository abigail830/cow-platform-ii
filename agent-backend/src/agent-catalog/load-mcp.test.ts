import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMcpServerUrl } from './load-mcp.ts';

test('resolveMcpServerUrl defaults HYBRID_SEARCH_MCP_URL to OPENKMS_API_URL when unset', () => {
  const prev = process.env.HYBRID_SEARCH_MCP_URL;
  const prevBase = process.env.OPENKMS_API_URL;
  delete process.env.HYBRID_SEARCH_MCP_URL;
  process.env.OPENKMS_API_URL = 'http://example.test:8787/';

  try {
    const url = resolveMcpServerUrl({
      name: 'hybrid-search',
      urlEnv: 'HYBRID_SEARCH_MCP_URL',
      transport: 'streamable-http',
    });
    assert.equal(url, 'http://example.test:8787/api/mcp/hybrid-search');
  } finally {
    if (prev === undefined) delete process.env.HYBRID_SEARCH_MCP_URL;
    else process.env.HYBRID_SEARCH_MCP_URL = prev;
    if (prevBase === undefined) delete process.env.OPENKMS_API_URL;
    else process.env.OPENKMS_API_URL = prevBase;
  }
});

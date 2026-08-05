import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandMcpTemplateString, parseMcpServersJson } from './parse-mcp-servers.ts';
import { listAssetSummaries, loadAssetManifest, loadPlatformMcpTemplate, resetAssetManifestCacheForTests } from './manifest.ts';

test('parseMcpServersJson accepts Cursor remote shape', () => {
  const parsed = parseMcpServersJson({
    mcpServers: {
      'hybrid-search': {
        url: 'https://example.com/api/mcp/hybrid-search',
        headers: { Authorization: 'Bearer x' },
      },
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.servers[0]?.name, 'hybrid-search');
  assert.equal(parsed.servers[0]?.transport, 'streamable-http');
});

test('parseMcpServersJson rejects stdio command', () => {
  const parsed = parseMcpServersJson({
    mcpServers: {
      fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
    },
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.error, /stdio|command/i);
});

test('platform MCP templates load from agent-assets', () => {
  resetAssetManifestCacheForTests();
  const manifest = loadAssetManifest();
  assert.ok(manifest.mcp.length >= 2);
  const hybrid = loadPlatformMcpTemplate('hybrid-search');
  assert.ok(hybrid.mcpServers['hybrid-search']);
  assert.equal(hybrid.title, 'Hybrid Search');
  assert.equal('allowTools' in hybrid, false);
  assert.ok(listAssetSummaries('skill').some((s) => s.id === 'kb-qa'));
});

test('expandMcpTemplateString substitutes placeholders', () => {
  assert.equal(
    expandMcpTemplateString('https://x${OPENKMS_API_URL}/y', { OPENKMS_API_URL: '.example' }),
    'https://x.example/y',
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAgentDirectories, loadAgentSpec } from './discover.ts';
import { agentAssetsRoot, agentCatalogRoot, resolveCatalogPath } from './paths.ts';

test('discovers platform agents under agent-assets/agents', () => {
  const dirs = discoverAgentDirectories();
  assert.ok(dirs.length >= 2);
  assert.ok(agentCatalogRoot().includes('agent-assets'));
  for (const dir of dirs) {
    const spec = loadAgentSpec(dir);
    assert.equal(spec.id, dir.split('/').pop());
    assert.equal(spec.source, 'fs');
    assert.ok(spec.instructions.length > 0);
  }
});

test('shared skill paths resolve from backend root', () => {
  const agentDir = `${agentCatalogRoot()}/content-studio`;
  const skillPath = resolveCatalogPath('/agent-assets/skills/kb-qa', agentDir);
  assert.ok(skillPath.includes('agent-assets/skills/kb-qa'));
  assert.ok(skillPath.startsWith(agentAssetsRoot().replace(/\/$/, '')) || skillPath.includes('agent-assets'));
});

test('content-studio prompt covers knowledge Q&A and content generation', () => {
  const studio = loadAgentSpec(`${agentCatalogRoot()}/content-studio`);
  assert.match(studio.instructions, /knowledge|search|answer/i);
  assert.match(studio.instructions, /document|slide|powerpoint|word/i);
  assert.ok(studio.skills.some((s) => s.includes('kb-qa')));
  assert.ok(studio.skills.some((s) => s.includes('docx')));
  assert.equal(studio.mcp.length, 2);
});

test('product-analytics prompt and datasource binding load', () => {
  const analytics = loadAgentSpec(`${agentCatalogRoot()}/product-analytics`);
  assert.match(analytics.instructions, /product analytics|adoption|platform/i);
  assert.deepEqual(analytics.datasourceNames, ['platform-analytics']);
  assert.equal(analytics.mcp.length, 0);
});

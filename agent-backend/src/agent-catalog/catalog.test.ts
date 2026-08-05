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
  const agentDir = `${agentCatalogRoot()}/kb-qa`;
  const skillPath = resolveCatalogPath('/agent-assets/skills/kb-qa', agentDir);
  assert.ok(skillPath.includes('agent-assets/skills/kb-qa'));
  assert.ok(skillPath.startsWith(agentAssetsRoot().replace(/\/$/, '')) || skillPath.includes('agent-assets'));
});

test('kb-qa and content-studio prompts load', () => {
  const kb = loadAgentSpec(`${agentCatalogRoot()}/kb-qa`);
  assert.match(kb.instructions, /knowledge|search|answer/i);
  const studio = loadAgentSpec(`${agentCatalogRoot()}/content-studio`);
  assert.match(studio.instructions, /document|slide|powerpoint|word/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAgentDirectories, loadAgentSpec } from './discover.ts';
import { agentCatalogRoot } from './paths.ts';

test('discovers catalog agents with matching ids', () => {
  const dirs = discoverAgentDirectories();
  assert.ok(dirs.length >= 2);
  for (const dir of dirs) {
    const spec = loadAgentSpec(dir);
    assert.equal(spec.id, dir.split('/').pop());
    assert.ok(spec.instructions.length > 0);
  }
});

test('agent catalog root exists', () => {
  assert.ok(agentCatalogRoot().endsWith('agent-catalog'));
});

test('kb-qa prompt loads from markdown file', () => {
  const spec = loadAgentSpec(`${agentCatalogRoot()}/kb-qa`);
  assert.match(spec.instructions, /knowledge|search|answer/i);
  assert.equal(spec.model.configName, 'qwen3.7-flash');
});

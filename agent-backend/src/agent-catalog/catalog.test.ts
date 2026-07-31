import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAgentDirectories, loadAgentSpec } from './discover.ts';
import { agentCatalogRoot } from './paths.ts';
import { listKnownToolPacks } from './tool-packs.ts';

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

test('smart-proposal prompt loads from markdown file', () => {
  const spec = loadAgentSpec(`${agentCatalogRoot()}/smart-proposal`);
  assert.match(spec.instructions, /proposal|OKF/i);
  assert.deepEqual(spec.tools.packs, [
    { name: 'okf', bundle: { kind: 'env', envVar: 'OKF_BUNDLE_PATH' } },
  ]);
  assert.equal(spec.model.configName, 'gpt-5.4-mini');
});

test('known tool packs include okf', () => {
  assert.ok(listKnownToolPacks().includes('okf'));
});

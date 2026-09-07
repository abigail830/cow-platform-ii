import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentVisibleToRoles } from './agent-access.ts';
import type { LoadedAgentSpec } from './schema.ts';

function spec(defaultForRoles: string[]): LoadedAgentSpec {
  return {
    id: 'demo',
    displayName: 'Demo',
    description: 'Demo',
    agentDir: '/tmp',
    instructions: 'x',
    model: { configName: 'test' },
    prompt: './prompt.md',
    skills: [],
    tools: { packs: [] },
    mcp: [],
    sandbox: { provider: 'none' },
    access: { defaultForRoles },
  };
}

test('isAgentVisibleToRoles matches any overlapping role key', () => {
  assert.equal(isAgentVisibleToRoles(spec(['admin']), ['admin']), true);
  assert.equal(isAgentVisibleToRoles(spec(['admin', 'editor']), ['editor']), true);
  assert.equal(isAgentVisibleToRoles(spec(['admin']), ['user']), false);
});

test('isAgentVisibleToRoles rejects empty allow list', () => {
  assert.equal(isAgentVisibleToRoles(spec([]), ['admin']), false);
});

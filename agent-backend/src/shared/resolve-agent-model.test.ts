import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel } from './models.ts';
import { resolveAgentModel } from './resolve-agent-model.ts';

test('resolveAgentModel falls back to profile when configName is absent', async () => {
  const model = await resolveAgentModel({ profile: 'openai' });
  assert.equal(model, resolveModel('openai'));
});

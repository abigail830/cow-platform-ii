import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import {
  ensureQwenOpenCodeGoCatalogEntry,
  qwenCatalogTemplateId,
} from './model-qwen-catalog-overlay.ts';

test('qwenCatalogTemplateId maps 3.7 flash to qwen3.6-plus compat template', () => {
  assert.equal(qwenCatalogTemplateId('qwen3.7-flash'), 'qwen3.6-plus');
});

test('ensureQwenOpenCodeGoCatalogEntry clones Qwen thinking metadata for custom ids', () => {
  const modelId = `qwen3.7-flash-test-${Date.now()}`;
  ensureQwenOpenCodeGoCatalogEntry(modelId, 'qwen3.6-plus');

  const model = getBuiltinModel('opencode-go', modelId);
  assert.ok(model);
  assert.equal(model?.id, modelId);
  assert.equal(model?.reasoning, true);
  assert.equal(model?.api, 'openai-completions');
  assert.equal(model?.compat?.thinkingFormat, 'qwen');
});

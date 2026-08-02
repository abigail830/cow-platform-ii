import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeModelConfig } from './model-config-store.ts';
import { resolveFlueModelFromConfig } from './model-flue-binding.ts';

function sampleConfig(overrides: Partial<RuntimeModelConfig> = {}): RuntimeModelConfig {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'DeepSeek-V4-Flash',
    modelId: 'deepseek-v4-flash',
    provider: 'openai',
    apiType: 'chat-completions',
    capabilities: [],
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    isDefault: false,
    extraConfig: {},
    ...overrides,
  };
}

test('resolveFlueModelFromConfig uses catalog openai provider when configured', () => {
  const model = resolveFlueModelFromConfig(sampleConfig());
  assert.equal(model, 'openai/deepseek-v4-flash');
});

test('resolveFlueModelFromConfig rejects unsupported api types', () => {
  assert.throws(
    () => resolveFlueModelFromConfig(sampleConfig({ apiType: 'embeddings' })),
    /must be apiType chat-completions/,
  );
});

test('resolveFlueModelFromConfig requires baseUrl', () => {
  assert.throws(
    () => resolveFlueModelFromConfig(sampleConfig({ baseUrl: null })),
    /missing baseUrl/,
  );
});

test('resolveFlueModelFromConfig uses catalog siliconflow provider when configured', () => {
  const model = resolveFlueModelFromConfig(
    sampleConfig({ provider: 'SiliconFlow', modelId: 'deepseek-ai/DeepSeek-V4-Flash' }),
  );
  assert.equal(model, 'siliconflow/deepseek-ai/DeepSeek-V4-Flash');
});

test('resolveFlueModelFromConfig uses azure-openai-responses catalog provider for Azure hosts', () => {
  const model = resolveFlueModelFromConfig(
    sampleConfig({
      name: 'gpt-5.4-mini',
      modelId: 'gpt-5.4-mini',
      provider: 'OpenAI',
      baseUrl: 'https://smart-sales.cognitiveservices.azure.com',
    }),
  );
  assert.equal(model, 'azure-openai-responses/gpt-5.4-mini');
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeSyncAgentDraft } from './normalize-sync-agent-draft.ts';

describe('normalizeSyncAgentDraft', () => {
  it('maps snake_case draft fields from the frontend', () => {
    const draft = normalizeSyncAgentDraft({
      model_config_id: 'model-1',
      system_prompt: 'system',
      user_prompt_template: 'user {question}',
      temperature: '0.3',
      max_tokens: 512,
    });

    assert.deepEqual(draft, {
      modelConfigId: 'model-1',
      apiType: undefined,
      systemPrompt: 'system',
      userPromptTemplate: 'user {question}',
      outputMode: undefined,
      temperature: '0.3',
      maxTokens: 512,
    });
  });

  it('preserves camelCase draft fields', () => {
    const draft = normalizeSyncAgentDraft({
      modelConfigId: 'model-2',
      systemPrompt: 'hello',
    });

    assert.equal(draft?.modelConfigId, 'model-2');
    assert.equal(draft?.systemPrompt, 'hello');
  });
});

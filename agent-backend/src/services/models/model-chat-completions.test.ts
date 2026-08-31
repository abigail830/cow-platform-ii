import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildChatCompletionBody,
  chatCompletionsUrl,
  shouldDisableThinking,
  shouldStreamChatCompletion,
} from './model-chat-completions.ts';

describe('chatCompletionsUrl', () => {
  it('rewrites DashScope /api/v1 to compatible-mode for chat/completions', () => {
    assert.equal(
      chatCompletionsUrl('https://dashscope.aliyuncs.com/api/v1'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
  });

  it('appends /v1/chat/completions when base has no version', () => {
    assert.equal(
      chatCompletionsUrl('https://api.siliconflow.cn'),
      'https://api.siliconflow.cn/v1/chat/completions',
    );
  });

  it('appends /chat/completions when base already ends with /v1', () => {
    assert.equal(
      chatCompletionsUrl('https://api.siliconflow.cn/v1'),
      'https://api.siliconflow.cn/v1/chat/completions',
    );
  });

  it('does not insert /v1 when base already ends with /v4 (Zhipu GLM)', () => {
    assert.equal(
      chatCompletionsUrl('https://open.bigmodel.cn/api/paas/v4'),
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    );
  });
});

describe('shouldDisableThinking', () => {
  it('disables thinking for siliconflow and qwen models', () => {
    assert.equal(shouldDisableThinking('https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3'), true);
    assert.equal(
      shouldDisableThinking('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.7-flash'),
      true,
    );
  });
});

describe('shouldStreamChatCompletion', () => {
  it('does not stream unless explicitly enabled', () => {
    assert.equal(
      shouldStreamChatCompletion(
        'https://api.siliconflow.cn/v1',
        'deepseek-ai/DeepSeek-V4-Flash',
      ),
      false,
    );
    assert.equal(
      shouldStreamChatCompletion(
        'https://api.siliconflow.cn/v1',
        'deepseek-ai/DeepSeek-V4-Flash',
        { stream_chat: true },
      ),
      true,
    );
  });
});

describe('buildChatCompletionBody', () => {
  it('disables thinking for non-v4 siliconflow models', () => {
    const body = buildChatCompletionBody({
      modelName: 'deepseek-ai/DeepSeek-V3',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://api.siliconflow.cn/v1',
      stream: false,
    });
    assert.equal(body.enable_thinking, false);
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 1024);
  });

  it('disables thinking for deepseek v4 on siliconflow', () => {
    const body = buildChatCompletionBody({
      modelName: 'deepseek-ai/DeepSeek-V4-Flash',
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://api.siliconflow.cn/v1',
      stream: true,
    });
    assert.equal(body.stream, true);
    assert.equal(body.enable_thinking, false);
    assert.deepEqual(body.thinking, { type: 'disabled' });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveRerankApiStyle } from './rerank-provider.ts';

describe('resolveRerankApiStyle', () => {
  it('detects SiliconFlow as cohere_compatible', () => {
    assert.equal(
      resolveRerankApiStyle({
        modelId: 'BAAI/bge-reranker-v2-m3',
        baseUrl: 'https://api.siliconflow.cn/v1',
      }),
      'cohere_compatible',
    );
  });

  it('detects DashScope compatible mode as openai_reranks', () => {
    assert.equal(
      resolveRerankApiStyle({
        modelId: 'qwen3-rerank',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      }),
      'openai_reranks',
    );
  });

  it('honors extraConfig override', () => {
    assert.equal(
      resolveRerankApiStyle({
        modelId: 'custom',
        baseUrl: 'https://api.example.com/v1',
        extraConfig: { rerank_api_style: 'dashscope_native' },
      }),
      'dashscope_native',
    );
  });
});

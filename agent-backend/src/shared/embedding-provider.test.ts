import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { embeddingSupportsDimensions } from './embedding-provider.ts';

describe('embeddingSupportsDimensions', () => {
  it('returns true for DashScope text-embedding-v4', () => {
    assert.equal(
      embeddingSupportsDimensions({
        modelId: 'text-embedding-v4',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      }),
      true,
    );
  });

  it('returns false for SiliconFlow bge-m3', () => {
    assert.equal(
      embeddingSupportsDimensions({
        modelId: 'BAAI/bge-m3',
        baseUrl: 'https://api.siliconflow.cn/v1',
      }),
      false,
    );
  });

  it('honors explicit extraConfig override', () => {
    assert.equal(
      embeddingSupportsDimensions({
        modelId: 'custom-model',
        baseUrl: 'https://api.example.com/v1',
        extraConfig: { supports_dimensions: true },
      }),
      true,
    );
  });
});

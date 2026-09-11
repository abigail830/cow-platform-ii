import { describe, expect, it } from 'vitest';
import {
  dashScopeVocabularyUrl,
  normalizeDashScopeAsrBaseUrl,
} from './asr-vocabulary-sync.ts';

describe('normalizeDashScopeAsrBaseUrl', () => {
  it('rewrites compatible-mode DashScope base to native /api/v1', () => {
    expect(
      normalizeDashScopeAsrBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1'),
    ).toBe('https://dashscope.aliyuncs.com/api/v1');
  });

  it('leaves native /api/v1 unchanged', () => {
    expect(normalizeDashScopeAsrBaseUrl('https://dashscope.aliyuncs.com/api/v1')).toBe(
      'https://dashscope.aliyuncs.com/api/v1',
    );
  });

  it('leaves non-DashScope bases unchanged', () => {
    expect(normalizeDashScopeAsrBaseUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1',
    );
  });
});

describe('dashScopeVocabularyUrl', () => {
  it('uses /services/audio/asr/customization under native /api/v1', () => {
    expect(dashScopeVocabularyUrl('https://dashscope.aliyuncs.com/api/v1')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization',
    );
  });

  it('rewrites compatible-mode base before appending customization path', () => {
    expect(dashScopeVocabularyUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization',
    );
  });
});

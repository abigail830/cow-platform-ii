import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePipelineConfigYaml } from './pipeline-config-yaml.ts';

describe('normalizePipelineConfigYaml', () => {
  it('returns null for blank', () => {
    assert.equal(normalizePipelineConfigYaml(null), null);
    assert.equal(normalizePipelineConfigYaml('  '), null);
  });

  it('accepts valid yaml with model_name', () => {
    const raw = 'model_name: "deepSeek-V4-Flash"\nsystem_prompt: hi\n';
    assert.equal(normalizePipelineConfigYaml(raw), raw.trim());
  });

  it('rejects api_key', () => {
    assert.throws(
      () => normalizePipelineConfigYaml('model_name: x\napi_key: secret\n'),
      /Forbidden key/,
    );
  });

  it('rejects model_id', () => {
    assert.throws(
      () =>
        normalizePipelineConfigYaml(
          'metadata_extract:\n  model_id: "00000000-0000-0000-0000-000000000000"\n',
        ),
      /Forbidden key/,
    );
  });
});

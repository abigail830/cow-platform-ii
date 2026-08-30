import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafePipelineName } from './pipeline-default-config.ts';

describe('pipeline-default-config', () => {
  it('rejects path traversal in pipeline_name', () => {
    assert.equal(isSafePipelineName('../secrets'), false);
  });

  it('accepts normal pipeline names', () => {
    assert.equal(isSafePipelineName('aliyun-docmind-parse'), true);
  });
});

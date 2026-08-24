import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readCliPackagedDefaultConfigYaml } from './cli-workflow-defaults.ts';

/** Dev/admin helper — not used on Vercel runtime paths (those read DB config_yaml). */
describe('cli-workflow-defaults (dev/admin)', () => {
  it('loads kb-rag-index default from agent-backend/pipeline-workflows', () => {
    const yaml = readCliPackagedDefaultConfigYaml('kb-rag-index');
    assert.ok(yaml?.includes('model_name:'));
    assert.ok(yaml?.includes('chunk:'));
  });

  it('returns null for unknown pipeline names', () => {
    assert.equal(readCliPackagedDefaultConfigYaml('not-a-real-pipeline'), null);
  });

  it('rejects path traversal in pipeline_name', () => {
    assert.equal(readCliPackagedDefaultConfigYaml('../secrets'), null);
  });
});

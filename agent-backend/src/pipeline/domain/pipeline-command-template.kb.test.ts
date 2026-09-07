import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWorkerCliArgsFromTemplate } from './pipeline-command-template.ts';

describe('pipeline-command-template kb worker', () => {
  it('buildWorkerCliArgsFromTemplate parses kb pageindex-import template', () => {
    const args = buildWorkerCliArgsFromTemplate(
      'openkms-cli kb pageindex-import --job-id {job_id}',
      'openkms-cli kb pageindex-import --job-id {job_id}',
      { job_id: 'job-abc' },
    );
    assert.deepEqual(args, ['kb', 'pageindex-import', '--job-id', 'job-abc']);
  });

  it('uses fallback when template is empty', () => {
    const args = buildWorkerCliArgsFromTemplate(
      '',
      'openkms-cli kb pageindex-import --job-id {job_id}',
      { job_id: 'job-xyz' },
    );
    assert.deepEqual(args, ['kb', 'pageindex-import', '--job-id', 'job-xyz']);
  });

  it('buildWorkerCliArgsFromTemplate parses kb rag-index template', () => {
    const args = buildWorkerCliArgsFromTemplate(
      'openkms-cli kb rag-index --job-id {job_id}',
      'openkms-cli kb rag-index --job-id {job_id}',
      { job_id: 'rag-job-1' },
    );
    assert.deepEqual(args, ['kb', 'rag-index', '--job-id', 'rag-job-1']);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkflowStatus } from '../domain/ingest-workflow-status.ts';

describe('deriveWorkflowStatus', () => {
  it('stays pending_upload until a file is confirmed', () => {
    assert.equal(
      deriveWorkflowStatus([{ status: 'pending_upload' }, { status: 'pending_upload' }]),
      'pending_upload',
    );
  });

  it('is running when mixed with in-flight items', () => {
    assert.equal(
      deriveWorkflowStatus([{ status: 'pending_upload' }, { status: 'running' }]),
      'running',
    );
  });

  it('maps terminal mixes', () => {
    assert.equal(deriveWorkflowStatus([{ status: 'completed' }, { status: 'completed' }]), 'completed');
    assert.equal(deriveWorkflowStatus([{ status: 'failed' }, { status: 'failed' }]), 'failed');
    assert.equal(
      deriveWorkflowStatus([{ status: 'completed' }, { status: 'failed' }]),
      'partially_completed',
    );
    assert.equal(deriveWorkflowStatus([{ status: 'cancelled' }, { status: 'cancelled' }]), 'cancelled');
  });
});

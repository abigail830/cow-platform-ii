import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDocumentPipelineTerminalStage,
  mapDocumentPipelineStageToEvalItemStage,
} from './eval-document-stage.ts';

describe('eval-document-stage', () => {
  it('maps in-flight document pipeline stages to transcribing', () => {
    assert.equal(mapDocumentPipelineStageToEvalItemStage('submitted'), 'submitted');
    assert.equal(mapDocumentPipelineStageToEvalItemStage('parsed'), 'transcribing');
    assert.equal(mapDocumentPipelineStageToEvalItemStage('extracted_metadata'), 'transcribing');
  });

  it('maps terminal document pipeline stages', () => {
    assert.equal(mapDocumentPipelineStageToEvalItemStage('done'), 'done');
    assert.equal(mapDocumentPipelineStageToEvalItemStage('failed'), 'failed');
  });

  it('detects terminal document pipeline stages', () => {
    assert.equal(isDocumentPipelineTerminalStage('done'), true);
    assert.equal(isDocumentPipelineTerminalStage('failed'), true);
    assert.equal(isDocumentPipelineTerminalStage('parsed'), false);
  });
});

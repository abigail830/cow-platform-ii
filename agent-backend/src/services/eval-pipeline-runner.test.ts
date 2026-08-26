import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapOpenkmsAudioCliArgsToEvaluateCli } from '../shared/pipeline-command-template.ts';

describe('eval pipeline cli args', () => {
  it('maps openkms audio-pipeline args to evaluate-cli pipeline args', () => {
    assert.deepEqual(
      mapOpenkmsAudioCliArgsToEvaluateCli(['audio-pipeline', 'run-async', '--job-id', 'job-1']),
      ['pipeline', 'run-async', '--job-id', 'job-1'],
    );
    assert.deepEqual(
      mapOpenkmsAudioCliArgsToEvaluateCli(['pipeline', 'run-async', '--job-id', 'job-1']),
      ['pipeline', 'run-async', '--job-id', 'job-1'],
    );
  });
});

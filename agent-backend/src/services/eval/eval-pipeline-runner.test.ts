import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEvalWorkerCliArgsFromTemplate,
  defaultEvalAsyncWorkerTemplate,
  mapOpenkmsAudioCliArgsToEvaluateCli,
  stripWorkerCliBinaryPrefix,
} from '../../shared/pipeline/pipeline-command-template.ts';
import { buildEvalWorkerCliArgs } from './eval-pipeline-runner.ts';
import {
  DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE,
  evalPipelineGithubDispatchUrl,
  resolveEvalPipelineGithubConfig,
} from './eval-pipeline-github-actions.ts';

describe('eval pipeline cli args', () => {
  it('uses evaluate-cli pipeline run-async with job id only', () => {
    assert.deepEqual(buildEvalWorkerCliArgs('job-1'), ['pipeline', 'run-async', '--job-id', 'job-1']);
    assert.deepEqual(buildEvalWorkerCliArgsFromTemplate('job-2'), [
      'pipeline',
      'run-async',
      '--job-id',
      'job-2',
    ]);
  });

  it('default eval template strips evaluate-cli binary prefix', () => {
    assert.match(defaultEvalAsyncWorkerTemplate(), /^evaluate-cli pipeline run-async/);
    assert.equal(
      stripWorkerCliBinaryPrefix(defaultEvalAsyncWorkerTemplate().replace('{job_id}', 'x')),
      'pipeline run-async --job-id x',
    );
  });

  it('does not pass openkms audio-pipeline args through to eval worker', () => {
    const mapped = mapOpenkmsAudioCliArgsToEvaluateCli([
      'audio-pipeline',
      'run-async',
      '--job-id',
      'job-1',
    ]);
    assert.deepEqual(mapped, ['pipeline', 'run-async', '--job-id', 'job-1']);
    assert.notEqual(mapped[0], 'audio-pipeline');
  });
});

describe('eval pipeline github actions', () => {
  it('resolves evaluate-pipeline workflow by default', () => {
    assert.equal(
      resolveEvalPipelineGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'token',
        GITHUB_PIPELINE_REPOSITORY: 'owner/repo',
      })?.workflowFile,
      DEFAULT_EVAL_PIPELINE_WORKFLOW_FILE,
    );
  });

  it('builds dispatch URL for evaluate-pipeline.yml', () => {
    const url = evalPipelineGithubDispatchUrl({
      token: 'token',
      repository: 'owner/repo',
      workflowFile: 'evaluate-pipeline.yml',
      ref: 'main',
    });
    assert.match(url, /evaluate-pipeline\.yml/);
  });
});

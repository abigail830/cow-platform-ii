import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  githubActionsDispatchUrl,
  resolveGithubActionsConfig,
  triggerGithubActionsPipeline,
} from './pipeline-github-actions.ts';
import {
  isServerlessRuntime,
  resolvePipelineWorkerMode,
  shouldRunPipelineStartupRecovery,
  shouldRunPipelineWatchdog,
} from './pipeline-worker-mode.ts';
import { pageIndexStrategyFromCliArgs } from '../../shared/pipeline/pipeline-command-template.ts';

describe('pipeline-worker-mode', () => {
  it('defaults to spawn locally', () => {
    assert.equal(resolvePipelineWorkerMode({}), 'spawn');
    assert.equal(resolvePipelineWorkerMode({ PIPELINE_WORKER: 'spawn' }), 'spawn');
  });

  it('defaults to github_actions on Vercel', () => {
    assert.equal(resolvePipelineWorkerMode({ VERCEL: '1' }), 'github_actions');
    assert.equal(
      resolvePipelineWorkerMode({ PIPELINE_WORKER: 'spawn', VERCEL: '1' }),
      'spawn',
    );
  });

  it('skips startup recovery and watchdog on serverless by default', () => {
    assert.equal(isServerlessRuntime({ VERCEL: '1' }), true);
    assert.equal(shouldRunPipelineStartupRecovery({ VERCEL: '1' }), false);
    assert.equal(shouldRunPipelineWatchdog({ VERCEL: '1' }), false);
    assert.equal(shouldRunPipelineStartupRecovery({}), true);
    assert.equal(shouldRunPipelineWatchdog({}), true);
  });
});

describe('pipeline-github-actions', () => {
  it('builds dispatch URL from owner/repo', () => {
    const url = githubActionsDispatchUrl({
      token: 't',
      repository: 'abigail830/openkms-cli',
      workflowFile: 'openkms-pipeline.yml',
      ref: 'main',
    });
    assert.equal(
      url,
      'https://api.github.com/repos/abigail830/openkms-cli/actions/workflows/openkms-pipeline.yml/dispatches',
    );
  });

  it('resolveGithubActionsConfig requires token and repository', () => {
    assert.equal(
      resolveGithubActionsConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
      })?.workflowFile,
      'openkms-pipeline.yml',
    );
    assert.equal(resolveGithubActionsConfig({ GITHUB_TOKEN: 'pat' }), null);
  });

  it('triggerGithubActionsPipeline posts workflow_dispatch inputs', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    };

    await triggerGithubActionsPipeline(
      { jobId: 'job-1', pageIndexStrategy: 'xmind-outline' },
      {
        token: 'pat',
        repository: 'abigail830/openkms-cli',
        workflowFile: 'openkms-pipeline.yml',
        ref: 'main',
      },
      fetchImpl,
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /openkms-pipeline\.yml\/dispatches$/);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      ref: string;
      inputs: { job_id: string; page_index_strategy: string };
    };
    assert.equal(body.ref, 'main');
    assert.equal(body.inputs.job_id, 'job-1');
    assert.equal(body.inputs.page_index_strategy, 'xmind-outline');
  });
});

describe('pageIndexStrategyFromCliArgs', () => {
  it('reads --page-index-strategy from CLI args', () => {
    assert.equal(
      pageIndexStrategyFromCliArgs([
        'pipeline',
        'run-async',
        '--job-id',
        'x',
        '--page-index-strategy',
        'aliyun-layouts',
      ]),
      'aliyun-layouts',
    );
    assert.equal(pageIndexStrategyFromCliArgs(['pipeline', 'run-async']), undefined);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capturePipelineGithubDispatchUrl,
  DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE,
  resolveCapturePipelineGithubConfig,
  triggerCapturePipelineGithubActions,
} from './audio-capture-pipeline-github-actions.ts';

describe('audio-capture-pipeline-github-actions', () => {
  it('builds dispatch URL from owner/repo', () => {
    const url = capturePipelineGithubDispatchUrl({
      token: 't',
      repository: 'abigail830/cow-platform-ii',
      workflowFile: DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE,
      ref: 'main',
    });
    assert.equal(
      url,
      'https://api.github.com/repos/abigail830/cow-platform-ii/actions/workflows/openkms-audio-capture-post-process.yml/dispatches',
    );
  });

  it('resolveCapturePipelineGithubConfig uses capture workflow default', () => {
    assert.equal(
      resolveCapturePipelineGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
      })?.workflowFile,
      DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE,
    );
    assert.equal(
      resolveCapturePipelineGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
        GITHUB_AUDIO_CAPTURE_PIPELINE_WORKFLOW: 'custom-capture.yml',
      })?.workflowFile,
      'custom-capture.yml',
    );
    assert.equal(resolveCapturePipelineGithubConfig({ GITHUB_TOKEN: 'pat' }), null);
  });

  it('triggerCapturePipelineGithubActions posts job_id and worker_cli_args', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    };

    await triggerCapturePipelineGithubActions(
      {
        jobId: 'job-capture-1',
        workerCliArgs: ['audio-capture', 'post-process', '--job-id', 'job-capture-1'],
      },
      {
        token: 'pat',
        repository: 'abigail830/cow-platform-ii',
        workflowFile: DEFAULT_CAPTURE_POST_PROCESS_WORKFLOW_FILE,
        ref: 'main',
      },
      fetchImpl,
    );

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      ref: string;
      inputs: { job_id: string; worker_cli_args: string };
    };
    assert.equal(body.ref, 'main');
    assert.equal(body.inputs.job_id, 'job-capture-1');
    assert.deepEqual(JSON.parse(body.inputs.worker_cli_args), [
      'audio-capture',
      'post-process',
      '--job-id',
      'job-capture-1',
    ]);
  });
});

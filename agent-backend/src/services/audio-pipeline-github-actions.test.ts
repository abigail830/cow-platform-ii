import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  audioPipelineGithubDispatchUrl,
  resolveAudioPipelineGithubConfig,
  triggerAudioPipelineGithubActions,
} from './audio-pipeline-github-actions.ts';

describe('audio-pipeline-github-actions', () => {
  it('builds dispatch URL from owner/repo', () => {
    const url = audioPipelineGithubDispatchUrl({
      token: 't',
      repository: 'abigail830/cow-platform-ii',
      workflowFile: 'openkms-audio-transcribe.yml',
      ref: 'main',
    });
    assert.equal(
      url,
      'https://api.github.com/repos/abigail830/cow-platform-ii/actions/workflows/openkms-audio-transcribe.yml/dispatches',
    );
  });

  it('resolveAudioPipelineGithubConfig uses audio workflow default', () => {
    assert.equal(
      resolveAudioPipelineGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
      })?.workflowFile,
      'openkms-audio-transcribe.yml',
    );
    assert.equal(
      resolveAudioPipelineGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
        GITHUB_AUDIO_PIPELINE_WORKFLOW: 'custom-audio.yml',
      })?.workflowFile,
      'custom-audio.yml',
    );
    assert.equal(resolveAudioPipelineGithubConfig({ GITHUB_TOKEN: 'pat' }), null);
  });

  it('triggerAudioPipelineGithubActions posts job_id and worker_cli_args', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    };

    await triggerAudioPipelineGithubActions(
      {
        jobId: 'job-audio-1',
        workerCliArgs: ['audio-pipeline', 'run-async', '--job-id', 'job-audio-1'],
      },
      {
        token: 'pat',
        repository: 'abigail830/cow-platform-ii',
        workflowFile: 'openkms-audio-transcribe.yml',
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
    assert.equal(body.inputs.job_id, 'job-audio-1');
    assert.deepEqual(JSON.parse(body.inputs.worker_cli_args), [
      'audio-pipeline',
      'run-async',
      '--job-id',
      'job-audio-1',
    ]);
  });
});

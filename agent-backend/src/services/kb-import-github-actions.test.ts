import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  kbImportGithubDispatchUrl,
  resolveKbImportGithubConfig,
  triggerKbImportGithubActions,
} from './kb-import-github-actions.ts';

describe('kb-import-github-actions', () => {
  it('builds dispatch URL from owner/repo', () => {
    const url = kbImportGithubDispatchUrl({
      token: 't',
      repository: 'abigail830/cow-platform-ii',
      workflowFile: 'openkms-kb-pageindex-import.yml',
      ref: 'main',
    });
    assert.equal(
      url,
      'https://api.github.com/repos/abigail830/cow-platform-ii/actions/workflows/openkms-kb-pageindex-import.yml/dispatches',
    );
  });

  it('resolveKbImportGithubConfig prefers new env name', () => {
    assert.equal(
      resolveKbImportGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
        GITHUB_KB_IMPORT_WORKFLOW: 'custom.yml',
      })?.workflowFile,
      'custom.yml',
    );
  });

  it('resolveKbImportGithubConfig falls back to legacy env name', () => {
    assert.equal(
      resolveKbImportGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
        GITHUB_KB_PAGEINDEX_IMPORT_WORKFLOW: 'legacy.yml',
      })?.workflowFile,
      'legacy.yml',
    );
    assert.equal(resolveKbImportGithubConfig({ GITHUB_TOKEN: 'pat' }), null);
  });

  it('triggerKbImportGithubActions posts job_id input', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    };

    await triggerKbImportGithubActions(
      { jobId: 'job-kb-1' },
      {
        token: 'pat',
        repository: 'abigail830/cow-platform-ii',
        workflowFile: 'openkms-kb-pageindex-import.yml',
        ref: 'main',
      },
      fetchImpl,
    );

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      ref: string;
      inputs: { job_id: string };
    };
    assert.equal(body.ref, 'main');
    assert.equal(body.inputs.job_id, 'job-kb-1');
  });
});

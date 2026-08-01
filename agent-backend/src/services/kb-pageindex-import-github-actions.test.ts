import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  kbPageIndexImportGithubDispatchUrl,
  resolveKbPageIndexImportGithubConfig,
  triggerKbPageIndexImportGithubActions,
} from './kb-pageindex-import-github-actions.ts';

describe('kb-pageindex-import-github-actions', () => {
  it('builds dispatch URL from owner/repo', () => {
    const url = kbPageIndexImportGithubDispatchUrl({
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

  it('resolveKbPageIndexImportGithubConfig defaults workflow file', () => {
    assert.equal(
      resolveKbPageIndexImportGithubConfig({
        GITHUB_PIPELINE_TOKEN: 'pat',
        GITHUB_PIPELINE_REPOSITORY: 'o/r',
      })?.workflowFile,
      'openkms-kb-pageindex-import.yml',
    );
    assert.equal(resolveKbPageIndexImportGithubConfig({ GITHUB_TOKEN: 'pat' }), null);
  });

  it('triggerKbPageIndexImportGithubActions posts job_id input', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    };

    await triggerKbPageIndexImportGithubActions(
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
    assert.match(calls[0].url, /openkms-kb-pageindex-import\.yml\/dispatches$/);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      ref: string;
      inputs: { job_id: string };
    };
    assert.equal(body.ref, 'main');
    assert.equal(body.inputs.job_id, 'job-kb-1');
  });
});

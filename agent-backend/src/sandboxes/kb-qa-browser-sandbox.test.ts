import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createKbQaBrowserSandboxFactory } from './kb-qa-browser-sandbox.ts';
import { KB_QA_WORKSPACE_CWD } from './kb-qa-workspace.ts';

describe('kb-qa-browser-sandbox', () => {
  it('creates session env with hybrid-search scripts on disk', async () => {
    const env = await createKbQaBrowserSandboxFactory().createSessionEnv({ id: 'test--instance' });
    assert.equal(env.cwd, KB_QA_WORKSPACE_CWD);
    assert.equal(
      await env.exists('skills/hybrid-search/scripts/list_knowledge_bases.mjs'),
      true,
    );
    const listing = await env.readdir('skills/hybrid-search/scripts');
    assert.ok(listing.includes('list_knowledge_bases.mjs'));
  });

  it('exposes host node for hybrid-search scripts', async () => {
    const env = await createKbQaBrowserSandboxFactory().createSessionEnv({ id: 'test--node' });
    const version = await env.exec('node --version');
    assert.equal(version.exitCode, 0);
    assert.match(version.stdout, /^v\d+\./);
  });
});

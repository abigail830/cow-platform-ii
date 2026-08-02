import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertKbQaWorkspaceSourcesExist,
  buildKbQaWorkspaceFiles,
  KB_QA_WORKSPACE_CWD,
} from './kb-qa-workspace.ts';

describe('kb-qa-workspace', () => {
  it('sources exist in openkms-skill', () => {
    assert.doesNotThrow(() => assertKbQaWorkspaceSourcesExist());
  });

  it('builds vfs paths under kb-qa skills root', () => {
    const files = buildKbQaWorkspaceFiles();
    assert.ok(files[`${KB_QA_WORKSPACE_CWD}/skills/hybrid-search/scripts/list_knowledge_bases.mjs`]);
    assert.ok(files[`${KB_QA_WORKSPACE_CWD}/skills/shared/_client.mjs`]);
  });
});

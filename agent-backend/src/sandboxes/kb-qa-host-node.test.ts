import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createKbQaHostNodeCommand } from './kb-qa-host-node.ts';
import { KB_QA_WORKSPACE_CWD, resolveOpenkmsSkillRoot } from './kb-qa-workspace.ts';

describe('kb-qa-host-node', () => {
  const skillRoot = resolveOpenkmsSkillRoot();

  it('runs node --version on the host', async () => {
    const node = createKbQaHostNodeCommand(skillRoot);
    const result = await node.execute(['--version'], {
      fs: {} as never,
      cwd: KB_QA_WORKSPACE_CWD,
      env: new Map(),
      limits: {} as never,
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^v\d+\./);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultEvalJudgeConfigYaml,
  parseEvalJudgeModelName,
  snapshotEvalJudgeConfigYaml,
} from './eval-judge-workflow.ts';

describe('eval-judge-workflow', () => {
  it('loads packaged default with model_name', () => {
    const yaml = defaultEvalJudgeConfigYaml();
    assert.match(yaml, /model_name:/);
    assert.equal(parseEvalJudgeModelName(yaml), 'deepSeek-V4-Flash');
  });

  it('reads nested judge.model_name', () => {
    assert.equal(
      parseEvalJudgeModelName('judge:\n  model_name: "gpt-test"\n'),
      'gpt-test',
    );
  });

  it('rejects missing model_name', () => {
    assert.throws(() => parseEvalJudgeModelName('scenario_id: x\n'), /model_name/);
  });

  it('snapshots valid override yaml', () => {
    const raw = 'model_name: "custom-judge"\n';
    assert.equal(snapshotEvalJudgeConfigYaml(raw), 'model_name: "custom-judge"');
  });
});

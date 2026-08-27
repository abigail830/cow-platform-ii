import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultEvalJudgeConfigYaml,
  parseEvalJudgeModelName,
  parseEvalJudgeScenarioId,
  snapshotEvalJudgeConfigYaml,
} from './eval-judge-workflow.ts';

describe('eval-judge-workflow', () => {
  it('loads packaged default with model_name and scenario_id', () => {
    const yaml = defaultEvalJudgeConfigYaml();
    assert.match(yaml, /model_name:/);
    assert.match(yaml, /scenario_id:/);
    assert.equal(parseEvalJudgeModelName(yaml), 'deepSeek-V4-Flash');
    assert.equal(parseEvalJudgeScenarioId(yaml), 'asr_pipeline_compare_no_gt');
  });

  it('reads nested judge.model_name', () => {
    assert.equal(
      parseEvalJudgeModelName('judge:\n  model_name: "gpt-test"\n'),
      'gpt-test',
    );
  });

  it('reads nested judge.scenario_id', () => {
    assert.equal(
      parseEvalJudgeScenarioId('model_name: m\njudge:\n  scenario_id: custom\n'),
      'custom',
    );
  });

  it('defaults scenario_id when omitted', () => {
    assert.equal(parseEvalJudgeScenarioId('model_name: "custom-judge"\n'), 'asr_pipeline_compare_no_gt');
  });

  it('rejects missing model_name', () => {
    assert.throws(() => parseEvalJudgeModelName('scenario_id: x\n'), /model_name/);
  });

  it('snapshots valid override yaml', () => {
    const raw = 'model_name: "custom-judge"\nscenario_id: "asr_pipeline_compare_no_gt"';
    assert.equal(snapshotEvalJudgeConfigYaml(raw), raw);
  });
});

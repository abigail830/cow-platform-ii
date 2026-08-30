import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseEvalJudgeModelName,
  parseEvalJudgeScenarioId,
  snapshotEvalJudgeConfigYaml,
} from './eval-judge-workflow.ts';
import {
  EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME,
  EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME,
} from './eval-judge-constants.ts';

const SAMPLE_NO_GT = `model_name: "deepSeek-V4-Flash"
scenario_id: asr_pipeline_compare_no_gt
`;

const SAMPLE_WITH_GT = `model_name: "deepSeek-V4-Flash"
scenario_id: asr_pipeline_compare_with_gt
`;

const SAMPLE_DOC_NO_GT = `model_name: "deepSeek-V4-Flash"
scenario_id: doc_parse_pipeline_compare_no_gt
`;

const SAMPLE_DOC_WITH_GT = `model_name: "deepSeek-V4-Flash"
scenario_id: doc_parse_pipeline_compare_with_gt
`;

describe('eval-judge-workflow', () => {
  it('parses model_name and scenario_id from yaml', () => {
    assert.equal(parseEvalJudgeModelName(SAMPLE_NO_GT), 'deepSeek-V4-Flash');
    assert.equal(parseEvalJudgeScenarioId(SAMPLE_NO_GT), 'asr_pipeline_compare_no_gt');
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

  it('parses GT and document scenario ids', () => {
    assert.equal(
      parseEvalJudgeScenarioId(SAMPLE_WITH_GT, EVAL_JUDGE_COMPARE_WITH_GT_PIPELINE_NAME),
      'asr_pipeline_compare_with_gt',
    );
    assert.equal(
      parseEvalJudgeScenarioId(SAMPLE_DOC_NO_GT, EVAL_JUDGE_DOC_COMPARE_PIPELINE_NAME),
      'doc_parse_pipeline_compare_no_gt',
    );
    assert.equal(
      parseEvalJudgeScenarioId(SAMPLE_DOC_WITH_GT, EVAL_JUDGE_DOC_COMPARE_WITH_GT_PIPELINE_NAME),
      'doc_parse_pipeline_compare_with_gt',
    );
  });

  it('snapshots valid override yaml', () => {
    const raw = 'model_name: "custom-judge"\nscenario_id: "asr_pipeline_compare_no_gt"';
    assert.equal(snapshotEvalJudgeConfigYaml(raw), raw);
  });

  it('rejects empty snapshot yaml', () => {
    assert.throws(() => snapshotEvalJudgeConfigYaml('   '), /empty/i);
  });
});

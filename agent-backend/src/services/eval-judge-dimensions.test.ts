import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVAL_JUDGE_SCENARIO_ID,
  getDefaultEvalJudgeScenario,
  snapshotEvalJudgeDimensions,
} from './eval-judge-dimensions.ts';

describe('eval-judge-dimensions', () => {
  it('loads default no-GT ASR compare scenario with variant and pairwise dimensions', async () => {
    const scenario = await getDefaultEvalJudgeScenario();
    assert.equal(scenario.id, DEFAULT_EVAL_JUDGE_SCENARIO_ID);
    assert.equal(scenario.requires_ground_truth, false);
    assert.equal(scenario.min_variants, 2);

    const dimensions = await snapshotEvalJudgeDimensions();
    assert.ok(dimensions.length >= 4);
    assert.ok(dimensions.some((dimension) => dimension.scope === 'variant'));
    assert.ok(dimensions.some((dimension) => dimension.scope === 'pairwise'));
    assert.ok(dimensions.some((dimension) => dimension.id === 'semantic_agreement'));
    const semantic = dimensions.find((dimension) => dimension.id === 'semantic_agreement');
    assert.match(semantic?.criteria ?? '', /0 to 10/i);
  });
});

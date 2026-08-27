import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvalJudgeGevalCriteria } from './eval-judge-criteria.ts';

describe('normalizeEvalJudgeGevalCriteria', () => {
  it('rewrites legacy 0–1 semantic agreement criteria to 0–10', () => {
    const legacy =
      'Two ASR transcripts from the same audio are provided as INPUT (variant A) and ACTUAL_OUTPUT (variant B). ' +
      'Score how well they convey the same overall meaning. Score 0 if they disagree on main content, 1 if they are semantically equivalent aside from wording differences.';
    const normalized = normalizeEvalJudgeGevalCriteria(legacy, 'geval_score');
    assert.match(normalized, /0.?10/i);
    assert.doesNotMatch(normalized, /,\s*1 if they are semantically equivalent/i);
  });

  it('keeps explicit 0–10 criteria and strips conflicting 0–1 phrases', () => {
    const mixed =
      'Evaluate readability. Score from 0 (hard) to 1 (easy). Use an integer score from 0 to 10 where 0 means hard to read and 10 means easy to read.';
    const normalized = normalizeEvalJudgeGevalCriteria(mixed, 'geval_score');
    assert.match(normalized, /0 to 10/i);
    assert.doesNotMatch(normalized, /Score from 0 \(hard\) to 1 \(easy\)/i);
  });

  it('does not alter geval_winner criteria', () => {
    const winner = 'Reply with A, B, or TIE. Explain your decision in 1–2 sentences.';
    assert.equal(normalizeEvalJudgeGevalCriteria(winner, 'geval_winner'), winner);
  });

  it('preserves paragraph breaks when normalizing legacy criteria', () => {
    const legacy =
      'Line one about the task.\n\nScore 0 if bad, 1 if good.\n\nLine three with bands 0–2 = poor; 9–10 = great.';
    const normalized = normalizeEvalJudgeGevalCriteria(legacy, 'geval_score');
    assert.match(normalized, /Line one about the task\.\n\n/);
    assert.doesNotMatch(normalized, /Do not use a or decimals/);
  });

  it('does not duplicate integer scale hints when already present', () => {
    const criteria =
      'Evaluate artifacts.\n\nAssign an integer score from 0 to 10 only.\n\nExplain your score in 1–2 sentences.';
    const once = normalizeEvalJudgeGevalCriteria(criteria, 'geval_score');
    const twice = normalizeEvalJudgeGevalCriteria(once, 'geval_score');
    assert.equal(once, twice);
    assert.doesNotMatch(once, /Do not use a or decimals/);
  });
});

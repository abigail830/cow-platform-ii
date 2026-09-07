import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reciprocalRankFusion } from './rrf.ts';

describe('reciprocalRankFusion', () => {
  it('favors items ranked highly in both lists', () => {
    const fused = reciprocalRankFusion(
      [
        [{ key: 'a' }, { key: 'b' }],
        [{ key: 'b' }, { key: 'c' }],
      ],
      60,
      3,
    );
    assert.equal(fused[0]?.key, 'b');
    assert.ok(fused.some((item) => item.key === 'a'));
    assert.ok(fused.some((item) => item.key === 'c'));
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThinkingLevel } from './thinking-level.ts';

test('parseThinkingLevel accepts known levels', () => {
  assert.equal(parseThinkingLevel('off'), 'off');
  assert.equal(parseThinkingLevel('Medium'), 'medium');
  assert.equal(parseThinkingLevel('invalid'), undefined);
});

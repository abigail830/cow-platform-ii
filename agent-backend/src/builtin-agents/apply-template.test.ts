import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPromptTemplate } from './apply-template.ts';

describe('applyPromptTemplate', () => {
  it('replaces placeholders', () => {
    const out = applyPromptTemplate('Q: {question}\nA: {answer}', {
      question: 'Timeline?',
      answer: '8 weeks',
    });
    assert.equal(out, 'Q: Timeline?\nA: 8 weeks');
  });
});

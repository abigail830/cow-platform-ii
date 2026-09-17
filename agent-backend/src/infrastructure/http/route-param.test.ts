import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from './route-param.ts';

describe('isUuid', () => {
  it('accepts a standard UUID', () => {
    assert.equal(isUuid('17c7b7fc-f535-467c-a535-73badd2aab22'), true);
  });

  it('rejects static Hono collection segments that share /:id', () => {
    assert.equal(isUuid('import-sources'), false);
    assert.equal(isUuid('rag-processing-options'), false);
    assert.equal(isUuid('faq-processing-options'), false);
  });
});

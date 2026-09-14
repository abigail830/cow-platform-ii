import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPageIndexDraft, parsePageIndexDraft } from './document-artifacts.ts';

describe('document artifact drafts', () => {
  it('pretty-prints an empty page index object', () => {
    assert.match(formatPageIndexDraft(null), /"structure": \[\]/);
  });

  it('rejects invalid page index JSON', () => {
    assert.throws(() => parsePageIndexDraft('{'), /valid JSON/);
    assert.throws(() => parsePageIndexDraft('[]'), /JSON object/);
    assert.deepEqual(parsePageIndexDraft('{"structure":[]}'), { structure: [] });
  });
});

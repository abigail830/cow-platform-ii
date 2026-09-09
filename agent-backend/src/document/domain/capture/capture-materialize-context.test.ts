import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptureMaterializeContext } from './capture-materialize-context.ts';

describe('capture-materialize-context', () => {
  it('defaults materialize off and uses segment hash', () => {
    const ctx = parseCaptureMaterializeContext({}, 'hash-abc');
    assert.equal(ctx.materialize_for_index, false);
    assert.equal(ctx.index_file_hash, 'hash-abc');
    assert.deepEqual(ctx.index_content, { audio: 'combined' });
  });

  it('reads workflow metadata flags', () => {
    const ctx = parseCaptureMaterializeContext(
      {
        materialize_for_index: true,
        index_document_id: ' doc-1 ',
        index_content: { audio: 'summary' },
        index_file_hash: ' custom-hash ',
      },
      'fallback-hash',
    );
    assert.equal(ctx.materialize_for_index, true);
    assert.equal(ctx.index_document_id, 'doc-1');
    assert.equal(ctx.index_file_hash, 'custom-hash');
    assert.deepEqual(ctx.index_content, { audio: 'summary' });
  });
});

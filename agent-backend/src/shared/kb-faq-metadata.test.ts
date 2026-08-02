import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { propagateDocMetadata } from '../shared/kb-faq-metadata.ts';

describe('kb-faq-metadata propagateDocMetadata', () => {
  it('filters by metadata keys whitelist', () => {
    const result = propagateDocMetadata(
      { department: 'HR', secret: 'x', year: 2024 },
      ['department', 'year'],
    );
    assert.deepEqual(result, { department: 'HR', year: 2024 });
  });

  it('returns null when keys empty', () => {
    assert.equal(propagateDocMetadata({ a: 1 }, []), null);
  });
});

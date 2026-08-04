import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOutboundFetchError } from './outbound-fetch.ts';

describe('formatOutboundFetchError', () => {
  it('includes fetch cause details', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo ENOTFOUND example.test'),
    });
    assert.match(
      formatOutboundFetchError(error, 'Embedding API', 'https://example.test/v1/embeddings'),
      /ENOTFOUND example\.test/,
    );
  });
});

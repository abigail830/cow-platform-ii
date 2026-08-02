import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeEmbeddingBase64 } from '../shared/kb-chunk-embedding.ts';

describe('decodeEmbeddingBase64', () => {
  it('decodes float32 little-endian vectors', () => {
    const buf = Buffer.alloc(8);
    buf.writeFloatLE(1.5, 0);
    buf.writeFloatLE(-2.25, 4);
    const decoded = decodeEmbeddingBase64(buf.toString('base64'));
    assert.equal(decoded.length, 2);
    assert.ok(Math.abs(decoded[0]! - 1.5) < 1e-6);
    assert.ok(Math.abs(decoded[1]! - -2.25) < 1e-6);
  });

  it('rejects invalid base64 length', () => {
    assert.throws(() => decodeEmbeddingBase64('abc'), /Invalid embedding base64 length/);
  });
});

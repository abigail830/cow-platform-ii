import { describe, expect, it } from 'vitest';
import { metadataNeedsExtraction } from './document-metadata-extraction.ts';

describe('metadataNeedsExtraction', () => {
  it('returns true for empty metadata', () => {
    expect(metadataNeedsExtraction({})).toBe(true);
    expect(metadataNeedsExtraction(null)).toBe(true);
  });

  it('returns true when all values are empty', () => {
    expect(metadataNeedsExtraction({ title: null, tags: [] })).toBe(true);
  });

  it('returns false when any value is present', () => {
    expect(metadataNeedsExtraction({ title: 'Doc' })).toBe(false);
  });
});

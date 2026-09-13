import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bundleImagePathCandidates } from './bundle-image-path-candidates.ts';

describe('bundleImagePathCandidates', () => {
  it('adds markdown_out prefix and jpeg/jpg variants', () => {
    const candidates = bundleImagePathCandidates('markdown_out/foo.jpeg');
    assert.ok(candidates.includes('markdown_out/foo.jpeg'));
    assert.ok(candidates.includes('markdown_out/foo.jpg'));
  });

  it('promotes bare image filenames into markdown_out/', () => {
    const candidates = bundleImagePathCandidates('abc.jpg');
    assert.ok(candidates.includes('abc.jpg'));
    assert.ok(candidates.includes('markdown_out/abc.jpg'));
  });
});

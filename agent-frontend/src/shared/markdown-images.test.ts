import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectRelativeMarkdownImagePaths,
  markdownImagePathCandidates,
  rewriteMarkdownImageUrls,
} from './markdown-images.ts';

describe('markdown-images', () => {
  it('collects unique relative image paths', () => {
    const md =
      '![a](markdown_out/a.png) ![b](https://x/y.png) ![c](./foo.jpg) ![d](markdown_out/a.png)';
    assert.deepEqual(collectRelativeMarkdownImagePaths(md), ['markdown_out/a.png', 'foo.jpg']);
  });

  it('builds storage path candidates', () => {
    assert.deepEqual(markdownImagePathCandidates('block_0.png'), [
      'block_0.png',
      'markdown_out/block_0.png',
    ]);
    assert.deepEqual(markdownImagePathCandidates('markdown_out/a.jpeg'), ['markdown_out/a.jpeg']);
  });

  it('rewrites relative urls from a map', () => {
    const md = '![alt](markdown_out/a.png) keep ![x](https://example/x.png)';
    const out = rewriteMarkdownImageUrls(md, {
      'markdown_out/a.png': 'https://signed.example/a.png',
    });
    assert.match(out, /!\[alt\]\(https:\/\/signed\.example\/a\.png\)/);
    assert.match(out, /!\[x\]\(https:\/\/example\/x\.png\)/);
  });
});

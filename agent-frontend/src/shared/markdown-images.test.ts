import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildImagePresignLookup,
  collectDocumentMarkdownImageStoragePaths,
  collectRelativeMarkdownImagePaths,
  markdownImagePathCandidates,
  ossMarkdownImagePathCandidates,
  resolveDocumentMarkdownImageUrl,
  resolvePresignedImageUrl,
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
    assert.deepEqual(markdownImagePathCandidates('markdown_out/a.jpeg'), [
      'markdown_out/a.jpeg',
      'markdown_out/a.jpg',
    ]);
  });

  it('maps docmind jpeg path to jpg bundle via alt text', () => {
    const lookup = buildImagePresignLookup([
      {
        path: 'markdown_out/f29999a192678ef083fa7c284481ca61.jpg',
        url: 'https://signed.example/img.jpg',
      },
    ]);
    const docmindUrl =
      'http://docmind-api.oss-cn-hangzhou.aliyuncs.com/out/f29999a192678ef083fa7c284481ca61.jpeg?Expires=1';
    assert.equal(
      resolveDocumentMarkdownImageUrl(
        docmindUrl,
        new Map(),
        lookup,
        'f29999a192678ef083fa7c284481ca61.jpg',
      ),
      'https://signed.example/img.jpg',
    );
  });

  it('maps stale OSS image URLs to bundle path candidates', () => {
    assert.deepEqual(
      ossMarkdownImagePathCandidates(
        'https://bucket.oss-cn-hongkong.aliyuncs.com/documents/abc/markdown_out/block_0.png?Expires=1',
      ),
      ['block_0.png', 'markdown_out/block_0.png'],
    );
    assert.ok(
      ossMarkdownImagePathCandidates(
        'https://docmind-api.oss.aliyuncs.com/out/f29999a192678ef083fa7c284481ca61.jpeg?Expires=1',
      ).includes('markdown_out/f29999a192678ef083fa7c284481ca61.jpg'),
    );
  });

  it('collects storage paths from relative and OSS markdown images', () => {
    const md =
      '![a](markdown_out/a.png) ![b](https://bucket.oss.aliyuncs.com/hash/e699b436.jpg?sig=1)';
    assert.deepEqual(collectDocumentMarkdownImageStoragePaths(md), [
      'markdown_out/a.png',
      'e699b436.jpg',
      'markdown_out/e699b436.jpg',
    ]);
  });

  it('collects bundle paths from platform asset URLs for presign fallback', () => {
    const docId = '550e8400-e29b-41d4-a716-446655440000';
    const md = `![x](/api/knowledge/documents/${docId}/assets/markdown_out/x.jpg)`;
    assert.ok(collectDocumentMarkdownImageStoragePaths(md, docId).includes('markdown_out/x.jpg'));
  });

  it('builds basename lookup for presigned bundle images', () => {
    const lookup = buildImagePresignLookup([
      { path: 'markdown_out/7fb7e5037340e71fd119dc62cc6a936d.jpg', url: 'https://signed.example/a.jpg' },
    ]);
    assert.equal(
      resolvePresignedImageUrl('7fb7e5037340e71fd119dc62cc6a936d.jpg', lookup),
      'https://signed.example/a.jpg',
    );
    assert.equal(
      resolvePresignedImageUrl('markdown_out/7fb7e5037340e71fd119dc62cc6a936d.jpg', lookup),
      'https://signed.example/a.jpg',
    );
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

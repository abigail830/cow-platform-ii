import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRagIndexYaml } from './rag-index-yaml.ts';

describe('rag-index-yaml', () => {
  it('parses model_name, dimensions, and markdown_header without size knobs', () => {
    const parsed = parseRagIndexYaml(
      [
        'model_name: "qwen3-Embedding-8B"',
        'dimensions: 4096',
        'chunk:',
        '  strategy: markdown_header',
        '',
      ].join('\n'),
      'test',
    );
    assert.equal(parsed.modelName, 'qwen3-Embedding-8B');
    assert.equal(parsed.dimensions, 4096);
    assert.equal(parsed.chunk.strategy, 'markdown_header');
    assert.equal(parsed.chunk.chunk_size, undefined);
    assert.equal(parsed.chunk.chunk_overlap, undefined);
  });

  it('parses fixed_size with chunk_size and chunk_overlap', () => {
    const parsed = parseRagIndexYaml(
      [
        'model_name: "qwen3-Embedding-8B"',
        'dimensions: 4096',
        'chunk:',
        '  strategy: fixed_size',
        '  chunk_size: 8000',
        '  chunk_overlap: 50',
        '',
      ].join('\n'),
      'test',
    );
    assert.equal(parsed.chunk.strategy, 'fixed_size');
    assert.equal(parsed.chunk.chunk_size, 8000);
    assert.equal(parsed.chunk.chunk_overlap, 50);
  });

  it('rejects missing model_name', () => {
    assert.throws(() => parseRagIndexYaml('dimensions: 1024\n', 'test'), /model_name/);
  });
});

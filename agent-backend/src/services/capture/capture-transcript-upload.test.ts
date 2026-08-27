import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTranscriptMarkdown,
  validateTranscriptFilename,
} from './capture-transcript-normalize.ts';

test('accepts md and docx filenames', () => {
  assert.equal(validateTranscriptFilename('notes.md'), 'notes.md');
  assert.equal(validateTranscriptFilename('notes.docx'), 'notes.docx');
  assert.throws(() => validateTranscriptFilename('audio.m4a'), /Transcript must be/);
});

test('wraps plain text transcripts with a markdown header', () => {
  const normalized = normalizeTranscriptMarkdown('Hello world', 'notes.md');
  assert.ok(normalized.includes('# notes'));
  assert.ok(normalized.includes('Hello world'));
});

test('preserves speaker turn markdown', () => {
  const source = '## [00:00:12] Speaker 1\nHello';
  assert.equal(normalizeTranscriptMarkdown(source, 'notes.md'), source);
});

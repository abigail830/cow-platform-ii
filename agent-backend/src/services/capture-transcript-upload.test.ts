import { describe, expect, it } from 'vitest';
import {
  normalizeTranscriptMarkdown,
  validateTranscriptFilename,
} from './capture-transcript-normalize.ts';

describe('capture-transcript-upload', () => {
  it('accepts md and docx filenames', () => {
    expect(validateTranscriptFilename('notes.md')).toBe('notes.md');
    expect(validateTranscriptFilename('notes.docx')).toBe('notes.docx');
    expect(() => validateTranscriptFilename('audio.m4a')).toThrow(/Transcript must be/);
  });

  it('wraps plain text transcripts with a markdown header', () => {
    const normalized = normalizeTranscriptMarkdown('Hello world', 'notes.md');
    expect(normalized).toContain('# notes');
    expect(normalized).toContain('Hello world');
  });

  it('preserves speaker turn markdown', () => {
    const source = '## [00:00:12] Speaker 1\nHello';
    expect(normalizeTranscriptMarkdown(source, 'notes.md')).toBe(source);
  });
});

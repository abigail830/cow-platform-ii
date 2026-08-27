import { extensionFromFilename } from '../../storage/audio-files.ts';

const TRANSCRIPT_EXTENSIONS = new Set(['md', 'markdown', 'docx']);
const TURN_HEADER = /^##\s+\[[^\]]+\]\s+.+\s*$/m;

export const MAX_TRANSCRIPT_UPLOAD_BYTES = 10 * 1024 * 1024;

export function validateTranscriptFilename(filename: string): string {
  const name = filename.trim();
  if (!name) throw new Error('Filename is required');
  const ext = extensionFromFilename(name).toLowerCase();
  if (!TRANSCRIPT_EXTENSIONS.has(ext)) {
    throw new Error('Transcript must be .md or .docx');
  }
  return name;
}

export function normalizeTranscriptMarkdown(text: string, filename: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Transcript file is empty');
  if (TURN_HEADER.test(trimmed)) {
    return trimmed;
  }
  const title = filename.replace(/\.[^.]+$/, '') || 'Transcript';
  return `# ${title}\n\n- Source: imported transcript\n\n${trimmed}`;
}

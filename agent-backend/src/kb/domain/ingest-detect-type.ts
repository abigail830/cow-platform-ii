import type { IngestWorkflowFileType } from '../../infrastructure/db/index.ts';

const AUDIO_EXTENSIONS = new Set([
  'm4a',
  'mp3',
  'wav',
  'flac',
  'aac',
  'amr',
  'ogg',
  'opus',
  'webm',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'docx',
  'pptx',
  'xlsx',
  'epub',
  'xmind',
  'md',
  'markdown',
]);

const TRANSCRIPT_EXTENSIONS = new Set(['md', 'markdown']);

export function extensionFromFilename(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function titleFromFilename(filename: string): string {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot > 0) return trimmed.slice(0, dot);
  return trimmed;
}

export function detectIngestFileType(input: {
  filename: string;
  explicitType?: string | null;
}): IngestWorkflowFileType {
  const filename = input.filename.trim();
  if (!filename) throw new Error('filename is required');

  const explicit = input.explicitType?.trim().toLowerCase();
  const ext = extensionFromFilename(filename);

  if (explicit === 'transcript') {
    if (!TRANSCRIPT_EXTENSIONS.has(ext)) {
      throw new Error('Workflow transcript uploads must be .md or .markdown');
    }
    return 'transcript';
  }
  if (explicit === 'audio') {
    if (!AUDIO_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported audio type .${ext || '(none)'}`);
    }
    return 'audio';
  }
  if (explicit === 'document') {
    if (!DOCUMENT_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported document type .${ext || '(none)'}`);
    }
    return 'document';
  }
  if (explicit) {
    throw new Error(`Unsupported type: ${explicit}`);
  }

  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  throw new Error(`Unsupported file type .${ext || '(none)'}`);
}

export function resolveIndexContentAudio(
  raw: unknown,
): 'combined' | 'summary' {
  if (raw == null) return 'combined';
  if (raw !== 'combined' && raw !== 'summary') {
    throw new Error('index_content.audio must be combined or summary');
  }
  return raw;
}

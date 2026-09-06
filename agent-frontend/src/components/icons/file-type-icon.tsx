import {
  BookOpen,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVolume,
  Mic,
  Presentation,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { DocumentCaptureInputMode } from '../../api/documentCaptures.ts';
import { iconProps } from './icon-props.ts';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg']);
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
  'wma',
]);

export function normalizeFileExtension(input: string | null | undefined): string {
  const raw = input?.trim().toLowerCase() ?? '';
  if (!raw) return '';
  const token = raw.includes('.') ? (raw.split('.').pop() ?? '') : raw;
  return token.replace(/[^a-z0-9]/g, '');
}

export function fileExtensionFromFilename(filename: string | null | undefined): string {
  if (!filename?.trim()) return '';
  return normalizeFileExtension(filename);
}

export function resolveKnowledgeFileIcon(input: {
  fileType?: string | null;
  filename?: string | null;
  inputMode?: DocumentCaptureInputMode;
}): LucideIcon {
  if (input.inputMode === 'audio') return Mic;
  if (input.inputMode === 'transcript') return FileVolume;

  const ext =
    normalizeFileExtension(input.fileType) || fileExtensionFromFilename(input.filename);

  if (ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'md' || ext === 'markdown' || ext === 'txt') {
    return FileText;
  }
  if (ext === 'xls' || ext === 'xlsx') return FileSpreadsheet;
  if (ext === 'csv') return FileText;
  if (IMAGE_EXTENSIONS.has(ext)) return FileImage;
  if (ext === 'ppt' || ext === 'pptx') return Presentation;
  if (ext === 'epub') return BookOpen;
  if (AUDIO_EXTENSIONS.has(ext)) return Mic;
  if (ext === 'xmind') return File;

  if (input.inputMode === 'document') return FileText;
  return File;
}

type KnowledgeFileTypeIconProps = LucideProps & {
  fileType?: string | null;
  filename?: string | null;
  inputMode?: DocumentCaptureInputMode;
};

export function KnowledgeFileTypeIcon({
  fileType,
  filename,
  inputMode,
  ...overrides
}: KnowledgeFileTypeIconProps) {
  const Icon = resolveKnowledgeFileIcon({ fileType, filename, inputMode });
  return <Icon {...iconProps(overrides)} />;
}

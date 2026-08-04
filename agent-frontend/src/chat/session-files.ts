export type SessionFileStatus = 'processing' | 'ready' | 'error';

export type SessionFile = {
  fileId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  includedInContext: boolean;
  /** Composer-only lifecycle; omitted in sent messages / manifest history. */
  status?: SessionFileStatus;
  errorMessage?: string;
  localId?: string;
};

export function isSessionFileReady(file: SessionFile): boolean {
  return !file.status || file.status === 'ready';
}

export function hasProcessingSessionFiles(files: SessionFile[]): boolean {
  return files.some((file) => file.status === 'processing');
}

export function composerReadySessionFiles(files: SessionFile[]): SessionFile[] {
  return files.filter((file) => isSessionFileReady(file));
}

export const SESSION_FILE_ACCEPT =
  '.md,.markdown,.txt,.csv,.docx,.xlsx,.xls,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/plain,text/markdown,text/csv,image/png,image/jpeg,image/webp,image/gif';

const SESSION_FILES_MARKER = 'SESSION_FILES';

export function formatSessionFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildSessionFilesMessagePrefix(files: SessionFile[]): string {
  const included = files.filter((file) => file.includedInContext && isSessionFileReady(file));
  if (included.length === 0) return '';

  const lines = [
    SESSION_FILES_MARKER,
    '| fileId | filename | size_bytes |',
    '| --- | --- | --- |',
    ...included.map(
      (file) => `| ${file.fileId} | ${file.filename.replace(/\|/g, '\\|')} | ${file.sizeBytes} |`,
    ),
  ];
  return lines.join('\n');
}

export function messageWithSessionFiles(userText: string, files: SessionFile[]): string {
  const prefix = buildSessionFilesMessagePrefix(files);
  const trimmed = userText.trim();
  if (!prefix) return trimmed;
  if (!trimmed) return prefix;
  return `${prefix}\n\n${trimmed}`;
}

export function stripSessionFilesManifest(text: string): string {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== SESSION_FILES_MARKER) return text;

  let index = 1;
  while (index < lines.length && lines[index]?.trim().startsWith('|')) {
    index += 1;
  }
  while (index < lines.length && lines[index]?.trim() === '') {
    index += 1;
  }
  return lines.slice(index).join('\n');
}

export function parseSessionFilesManifest(text: string): SessionFile[] {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(SESSION_FILES_MARKER)) return [];

  const lines = trimmed.split('\n');
  const files: SessionFile[] = [];
  for (const line of lines) {
    if (!line.startsWith('| sf_')) continue;
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;
    const [fileId, filename, sizeRaw] = cells;
    const sizeBytes = Number(sizeRaw);
    if (!fileId?.startsWith('sf_') || !filename || !Number.isFinite(sizeBytes)) continue;
    files.push({
      fileId,
      filename: filename.replace(/\\\|/g, '|'),
      sizeBytes,
      mimeType: 'application/octet-stream',
      includedInContext: true,
    });
  }
  return files;
}

export function listItemToSessionFile(item: {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): SessionFile {
  return {
    fileId: item.fileId,
    filename: item.filename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    includedInContext: true,
  };
}

import { getSessionFile } from '../../storage/session-files/repository.ts';
import { SESSION_FILE_READ_MAX_CHARS } from '../../storage/session-files/constants.ts';
import {
  ensureSessionFileContentCached,
  readSessionFileCachedText,
} from '../../storage/session-files/session-file-service.ts';

export type SessionFileReadResult = {
  fileId: string;
  filename: string;
  mimeType: string;
  offset: number;
  returnedChars: number;
  totalChars: number;
  truncated: boolean;
  nextOffset?: number;
  warnings?: string[];
  text: string;
};

export async function readSessionFileText(options: {
  instanceId: string;
  fileId: string;
  offset?: number;
  limit?: number;
}): Promise<SessionFileReadResult> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(
    SESSION_FILE_READ_MAX_CHARS,
    Math.max(1, options.limit ?? SESSION_FILE_READ_MAX_CHARS),
  );

  const record = await getSessionFile(options.instanceId, options.fileId);
  if (!record) throw new Error(`Session file not found: ${options.fileId}`);

  await ensureSessionFileContentCached(options.instanceId, options.fileId);
  const fullText = (await readSessionFileCachedText(options.instanceId, options.fileId)) ?? '';
  const warnings: string[] = [];
  if (record.mimeType.startsWith('image/')) {
    warnings.push('image_vision_extracted');
  }

  return sliceReadResult({
    fileId: record.id,
    filename: record.filename,
    mimeType: record.mimeType,
    fullText,
    offset,
    limit,
    warnings,
  });
}

function sliceReadResult(params: {
  fileId: string;
  filename: string;
  mimeType: string;
  fullText: string;
  offset: number;
  limit: number;
  warnings?: string[];
}): SessionFileReadResult {
  const totalChars = params.fullText.length;
  const slice = params.fullText.slice(params.offset, params.offset + params.limit);
  const truncated = params.offset + slice.length < totalChars;
  return {
    fileId: params.fileId,
    filename: params.filename,
    mimeType: params.mimeType,
    offset: params.offset,
    returnedChars: slice.length,
    totalChars,
    truncated,
    ...(truncated ? { nextOffset: params.offset + slice.length } : {}),
    ...(params.warnings?.length ? { warnings: params.warnings } : {}),
    text: slice,
  };
}

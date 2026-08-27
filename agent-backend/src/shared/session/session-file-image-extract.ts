import { runSyncAgent } from '../../builtin-agents/sync-agent-runner.ts';
import { SESSION_FILE_READ_MAX_CHARS } from '../../storage/session-files/constants.ts';
import type { ExtractResult } from './session-file-extract.ts';

function normalizeVisionMimeType(mimeType: string, filename: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed.startsWith('image/')) return trimmed;
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

export async function extractSessionImageText(params: {
  fileId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ExtractResult> {
  const mimeType = normalizeVisionMimeType(params.mimeType, params.filename);

  const result = await runSyncAgent({
    workflowKey: 'session_image_extract',
    variables: { filename: params.filename },
    image: { mimeType, base64: params.bytes.toString('base64') },
    context: {
      triggerType: 'upload',
      resourceType: 'session_file',
      resourceId: params.fileId,
      inputSummary: params.filename,
    },
  });

  let text = String(result.parsed);
  const warnings = ['image_vision_extracted'];
  if (text.length > SESSION_FILE_READ_MAX_CHARS) {
    text = text.slice(0, SESSION_FILE_READ_MAX_CHARS);
    warnings.push('image_extract_truncated');
  }

  return { text, warnings };
}

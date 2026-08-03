/** Matches Flue `AgentPromptImage` sent via `agent.sendMessage(message, { images })`. */
export type AgentPromptImage = {
  type: 'image';
  data: string;
  mimeType: string;
  filename?: string;
};

export type ChatSendPayload = {
  text: string;
  images: AgentPromptImage[];
};

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/** Flue rejects base64 payloads above ~14 MiB characters. */
const MAX_BASE64_CHARS = 14_680_064;
const MAX_RAW_BYTES = 10 * 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
}

function validateImageFile(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only PNG, JPEG, WebP, and GIF images are supported.');
  }
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Image is too large (max 10 MB).');
  }
}

export async function fileToAgentPromptImage(file: File): Promise<AgentPromptImage> {
  validateImageFile(file);
  const data = arrayBufferToBase64(await file.arrayBuffer());
  if (data.length > MAX_BASE64_CHARS) {
    throw new Error('Image is too large after encoding.');
  }
  return {
    type: 'image',
    data,
    mimeType: file.type,
    ...(file.name ? { filename: file.name } : {}),
  };
}

export function buildPromptImagePreviewUrl(image: AgentPromptImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export function isImageMediaType(mediaType: string | undefined): boolean {
  return Boolean(mediaType?.startsWith('image/'));
}

/** Flue requires a non-empty message string even when sending images only. */
export function normalizePromptMessage(text: string, imageCount: number): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  return imageCount > 0 ? ' ' : '';
}

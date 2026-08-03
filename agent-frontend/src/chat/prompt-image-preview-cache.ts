import { buildPromptImagePreviewUrl, type AgentPromptImage } from './prompt-images.ts';

export type CachedPromptImagePreview = {
  label: string;
  previewUrl: string;
};

const bySubmissionId = new Map<string, CachedPromptImagePreview[]>();

let pendingImages: AgentPromptImage[] | null = null;

export function stagePromptImagesForNextSend(images: AgentPromptImage[]): void {
  pendingImages = images.length > 0 ? images : null;
}

export function cachePromptImagePreviews(
  submissionId: string,
  images: AgentPromptImage[],
): void {
  if (!submissionId || images.length === 0) return;
  bySubmissionId.set(
    submissionId,
    images.map((image) => ({
      label: image.filename?.trim() || 'Image',
      previewUrl: buildPromptImagePreviewUrl(image),
    })),
  );
}

export function getCachedPromptImagePreviews(
  submissionId: string | undefined,
): CachedPromptImagePreview[] | undefined {
  if (!submissionId) return undefined;
  return bySubmissionId.get(submissionId);
}

/** Bind staged send payloads to the durable user message submission id. */
export function bindPendingPromptImageCache(messages: { role: string; submissionId?: string }[]): void {
  if (!pendingImages?.length) return;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user' || !message.submissionId) continue;
    if (bySubmissionId.has(message.submissionId)) {
      pendingImages = null;
      return;
    }
    cachePromptImagePreviews(message.submissionId, pendingImages);
    pendingImages = null;
    return;
  }
}

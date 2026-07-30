import { getChannelById } from './documents.ts';
import { startDocumentPipeline } from './pipeline-runner.ts';

/**
 * Start the channel pipeline after upload when auto-start is enabled.
 * Upload succeeds even if pipeline start fails (document may be marked failed by runner).
 */
export async function autoStartPipelineAfterUpload(documentId: string, channelId: string): Promise<void> {
  const channel = await getChannelById(channelId);
  if (!channel?.autoStartPipeline || !channel.pipelineId) return;

  try {
    await startDocumentPipeline(documentId);
  } catch (error) {
    console.error(
      `[auto-pipeline] Failed to start pipeline for document ${documentId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

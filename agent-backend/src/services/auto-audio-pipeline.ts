import { getAudioChannelById } from './audios.ts';
import { startAudioPipeline } from './audio-pipeline-runner.ts';

export async function autoStartAudioPipelineAfterUpload(audioId: string, channelId: string): Promise<void> {
  const channel = await getAudioChannelById(channelId);
  if (!channel?.autoStartPipeline || !channel.pipelineId) return;

  try {
    await startAudioPipeline(audioId);
  } catch (error) {
    console.error(
      `[auto-audio-pipeline] Failed to start pipeline for audio ${audioId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

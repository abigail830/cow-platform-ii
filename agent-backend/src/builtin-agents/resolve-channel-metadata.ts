import { getChannelById } from '../services/documents.ts';
import {
  METADATA_EXTRACT_NOT_CONFIGURED,
  resolvedAgentToWorkerLlmConfig,
  type WorkerLlmConfig,
} from './worker-llm-config.ts';
import { resolveChannelMetadataAgent } from './resolve-workflow-agent.ts';

/** Resolve channel metadata extraction agent into a worker snapshot, or null when disabled. */
export async function resolveChannelMetadataExtractionConfig(
  channelId: string,
): Promise<WorkerLlmConfig | null> {
  const channel = await getChannelById(channelId);
  if (!channel) throw new Error('Channel not found');

  const wantsExtraction = Boolean(channel.metadataExtractionAgentDefId);
  if (!wantsExtraction) return null;

  try {
    const agent = await resolveChannelMetadataAgent(channelId);
    return resolvedAgentToWorkerLlmConfig(agent);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`${METADATA_EXTRACT_NOT_CONFIGURED} (${detail})`);
  }
}

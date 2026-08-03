import type { LoadedAgentSpec } from '../../agent-catalog/schema.ts';
import { a2aChannelName, isA2aEnabledForSpec, readPublicApiUrl } from './config.ts';

export type AgentA2aPublicSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
};

export type AgentA2aPublicInfo = {
  channelName: string;
  endpointUrl: string;
  agentCardUrl: string;
  skills: AgentA2aPublicSkill[];
};

export function buildAgentA2aPublicInfo(spec: LoadedAgentSpec): AgentA2aPublicInfo | null {
  if (!isA2aEnabledForSpec(spec) || !spec.a2a) return null;

  const channelName = a2aChannelName(spec.id);
  const baseUrl = `${readPublicApiUrl()}/api/channels/${channelName}`;

  return {
    channelName,
    endpointUrl: `${baseUrl}/v1/message:send`,
    agentCardUrl: `${baseUrl}/.well-known/agent-card.json`,
    skills: spec.a2a.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags ?? [],
      examples: skill.examples ?? [],
    })),
  };
}

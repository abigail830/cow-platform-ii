import {
  AgentCard,
  type AgentSkill,
  type SecurityRequirement,
  type SecurityScheme,
} from '@a2a-js/sdk';
import type { LoadedAgentSpec } from '../../agent-catalog/schema.ts';
import { a2aChannelName, readA2aApiKey, readPublicApiUrl } from './config.ts';

const DEFAULT_INPUT_MODES = ['text/plain'] as const;
const DEFAULT_OUTPUT_MODES = ['text/plain', 'application/json'] as const;

function buildSkills(spec: LoadedAgentSpec): AgentSkill[] {
  const a2aSkills = spec.a2a?.skills ?? [];
  return a2aSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags ?? [],
    examples: skill.examples ?? [],
    inputModes: skill.inputModes ?? [...DEFAULT_INPUT_MODES],
    outputModes: skill.outputModes ?? [...DEFAULT_OUTPUT_MODES],
    securityRequirements: [],
  }));
}

export function buildAgentCardForSpec(spec: LoadedAgentSpec): ReturnType<typeof AgentCard.fromJSON> {
  const channelName = a2aChannelName(spec.id);
  const baseUrl = `${readPublicApiUrl()}/api/channels/${channelName}`;
  const description = spec.a2a?.description?.trim() || spec.description;
  const name = spec.a2a?.name?.trim() || spec.displayName;
  const apiKey = readA2aApiKey();

  const securitySchemes: Record<string, SecurityScheme> = {};
  const securityRequirements: SecurityRequirement[] = [];

  if (apiKey) {
    securitySchemes.apiKey = {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Bearer API key (A2A_API_KEY)',
    };
    securityRequirements.push({ schemes: { apiKey: [] } });
  }

  return AgentCard.fromJSON({
    name,
    description,
    version: spec.a2a?.version ?? '1.0.0',
    documentationUrl: spec.a2a?.documentationUrl,
    provider: spec.a2a?.provider,
    supportedInterfaces: [
      {
        url: baseUrl,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
        tenant: '',
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [],
    },
    defaultInputModes: [...DEFAULT_INPUT_MODES],
    defaultOutputModes: [...DEFAULT_OUTPUT_MODES],
    skills: buildSkills(spec),
    securitySchemes,
    securityRequirements,
    signatures: [],
  });
}

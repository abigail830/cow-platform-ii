import {
  AgentCard,
  type AgentSkill,
  type SecurityRequirement,
  type SecurityScheme,
} from '@a2a-js/sdk';
import type { LoadedAgentSpec } from '../../agent-catalog/schema.ts';
import { a2aChannelName, readA2aApiKey, readPublicApiUrl } from './config.ts';

function skillIdFromRef(skillRef: string): string {
  const normalized = skillRef.replace(/^\.\//, '').split('/').filter(Boolean);
  return normalized[normalized.length - 1] ?? skillRef;
}

function buildSkills(spec: LoadedAgentSpec): AgentSkill[] {
  const description = spec.a2a?.description?.trim() || spec.description;

  if (spec.a2a?.skills?.length) {
    return spec.a2a.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags ?? [spec.id],
      examples: skill.examples ?? [],
      inputModes: skill.inputModes ?? ['text/plain'],
      outputModes: skill.outputModes ?? ['text/plain'],
    }));
  }

  if (spec.skills.length === 0) {
    return [
      {
        id: spec.id,
        name: spec.displayName,
        description,
        tags: [spec.id],
        examples: [],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
      },
    ];
  }

  return spec.skills.map((skillRef) => {
    const id = skillIdFromRef(skillRef);
    return {
      id,
      name: id,
      description: `${spec.displayName} — ${id}`,
      tags: [spec.id, id],
      examples: [],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
    };
  });
}

export function buildAgentCardForSpec(spec: LoadedAgentSpec): ReturnType<typeof AgentCard.fromJSON> {
  const channelName = a2aChannelName(spec.id);
  const baseUrl = `${readPublicApiUrl()}/api/channels/${channelName}`;
  const description = spec.a2a?.description?.trim() || spec.description;
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
    name: spec.displayName,
    description,
    version: spec.a2a?.version ?? '1.0.0',
    supportedInterfaces: [
      {
        url: baseUrl,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
        tenant: '',
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
    },
    defaultInputModes: spec.a2a?.defaultInputModes ?? ['text/plain'],
    defaultOutputModes: spec.a2a?.defaultOutputModes ?? ['text/plain'],
    skills: buildSkills(spec),
    securitySchemes,
    securityRequirements,
    signatures: [],
  });
}

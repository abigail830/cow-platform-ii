import { DEFAULT_CATALOG_MODEL_PROFILE, LEGACY_MODEL_PROFILES, resolveModel } from './models.ts';

export type AgentModelYaml = {
  configName?: string;
  profile?: string;
};

export function resolveAgentProfileName(model: AgentModelYaml): string {
  return model.profile?.trim() || process.env.MODEL_PROFILE?.trim() || DEFAULT_CATALOG_MODEL_PROFILE;
}

export function isLegacyModelProfile(profile: string): boolean {
  return LEGACY_MODEL_PROFILES.has(profile);
}

export async function resolveAgentModel(model: AgentModelYaml): Promise<string> {
  const configName = model.configName?.trim();
  if (configName) {
    const { resolveFlueModelFromConfigName } = await import('./model-registry.ts');
    return resolveFlueModelFromConfigName(configName);
  }

  const profile = resolveAgentProfileName(model);

  if (isLegacyModelProfile(profile)) {
    return resolveModel(profile);
  }

  const { resolveFlueModelFromConfigName } = await import('./model-registry.ts');
  return resolveFlueModelFromConfigName(profile);
}

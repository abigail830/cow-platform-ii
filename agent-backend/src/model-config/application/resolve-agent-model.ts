import { DEFAULT_CATALOG_MODEL_PROFILE, LEGACY_MODEL_PROFILES, resolveModel } from '../domain/models.ts';

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
    const { resolveModelSpecifierByConfigName } = await import('../infrastructure/model-registry.ts');
    return resolveModelSpecifierByConfigName(configName);
  }

  const profile = resolveAgentProfileName(model);

  if (isLegacyModelProfile(profile)) {
    return resolveModel(profile);
  }

  const { resolveModelSpecifierByConfigName } = await import('../infrastructure/model-registry.ts');
  return resolveModelSpecifierByConfigName(profile);
}

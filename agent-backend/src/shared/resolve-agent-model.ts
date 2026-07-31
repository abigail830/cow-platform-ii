import { resolveModel } from './models.ts';

export type AgentModelYaml = {
  configName?: string;
  profile?: string;
};

export async function resolveAgentModel(model: AgentModelYaml): Promise<string> {
  const configName = model.configName?.trim();
  if (configName) {
    const { resolveFlueModelFromConfigName } = await import('./model-registry.ts');
    return resolveFlueModelFromConfigName(configName);
  }
  return resolveModel(model.profile);
}

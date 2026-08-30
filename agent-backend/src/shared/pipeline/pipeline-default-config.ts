function isSafePipelineName(pipelineName: string): boolean {
  const name = pipelineName.trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return false;
  }
  return true;
}

/** System pipeline default worker YAML from DB (canonical on Vercel + Admin). */
export async function readSystemPipelineConfigYaml(pipelineName: string): Promise<string | null> {
  if (!isSafePipelineName(pipelineName)) return null;
  const { getPipelineConfigByPipelineName } = await import('./pipeline-config-store.ts');
  const row = await getPipelineConfigByPipelineName(pipelineName.trim());
  if (!row?.isSystem) return null;
  const yaml = row.configYaml?.trim();
  return yaml || null;
}

export { isSafePipelineName };

/** Resolve worker YAML to snapshot on jobs — DB only (no filesystem fallback). */
export async function resolvePipelineConfigYamlSnapshot(input: {
  pipelineName: string;
  configYaml?: string | null;
  isSystem?: boolean;
}): Promise<string | null> {
  const fromRow = input.configYaml?.trim();
  if (fromRow) return fromRow;

  if (!input.isSystem) return null;

  const fromDb = await readSystemPipelineConfigYaml(input.pipelineName);
  if (!fromDb) {
    throw new Error(
      `System pipeline ${input.pipelineName} has no config_yaml in DB. Run db:migrate.`,
    );
  }
  return fromDb;
}

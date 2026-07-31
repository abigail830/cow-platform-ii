export function resolveModel(profile?: string): string {
  const p = profile ?? process.env.MODEL_PROFILE ?? 'azure-openai';
  const azureDeployment =
    process.env.AZURE_OPENAI_DEPLOYMENT ??
    process.env.AZURE_DEPLOYMENT_NAME ??
    'gpt-4o';

  switch (p) {
    case 'openai':
      return `openai/${process.env.OPENAI_MODEL ?? 'gpt-4o'}`;
    case 'azure-openai':
      return `azure-openai-responses/${azureDeployment}`;
    case 'siliconflow':
      return `siliconflow/${process.env.SILICONFLOW_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct'}`;
    case 'anthropic':
      return process.env.ANTHROPIC_MODEL ?? 'anthropic/claude-sonnet-4-20250514';
    default:
      return p.includes('/') ? p : `azure-openai-responses/${p}`;
  }
}

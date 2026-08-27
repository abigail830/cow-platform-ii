/** Whether an OpenAI-compatible embeddings API accepts the `dimensions` request parameter. */

export function embeddingSupportsDimensions(input: {
  modelId: string;
  baseUrl: string | null;
  extraConfig?: Record<string, unknown>;
}): boolean {
  const explicit = input.extraConfig?.supports_dimensions ?? input.extraConfig?.supportsDimensions;
  if (explicit === true) return true;
  if (explicit === false) return false;

  const model = input.modelId.toLowerCase();
  const base = (input.baseUrl ?? '').toLowerCase();

  const isAli =
    base.includes('dashscope') ||
    base.includes('aliyuncs.com') ||
    base.includes('maas.aliyuncs.com');
  if (isAli) {
    if (model.includes('text-embedding-v3') || model.includes('text-embedding-v4')) return true;
    if (model.includes('qwen') && model.includes('embedding')) return true;
    if (model.includes('tongyi-embedding')) return true;
    return false;
  }

  const isOpenAi = base.includes('openai.com');
  if (isOpenAi && model.includes('text-embedding-3')) return true;

  // SiliconFlow / most third-party hosted bge-m3 etc. use fixed output dims.
  return false;
}

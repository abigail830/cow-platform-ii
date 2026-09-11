const overlayKeys = new Set<string>();

/** Pick a catalog template with openai-completions + Qwen thinking compat. */
export function qwenCatalogTemplateId(modelId: string): string {
  const id = modelId.trim().toLowerCase();
  if (id.includes('3.7')) {
    if (id.includes('max')) return 'qwen3.7-max';
    return 'qwen3.6-plus';
  }
  if (id.includes('3.6')) return 'qwen3.6-plus';
  return 'qwen3.6-plus';
}

/** Legacy hook retained for model config resolution; no runtime catalog registration. */
export function ensureQwenOpenCodeGoCatalogEntry(modelId: string, templateId: string): void {
  overlayKeys.add(`${modelId.trim()}::${templateId}`);
}

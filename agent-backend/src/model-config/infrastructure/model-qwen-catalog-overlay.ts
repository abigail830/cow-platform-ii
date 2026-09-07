import { OPENCODE_GO_MODELS } from '@earendil-works/pi-ai/providers/opencode-go.models';

const overlayKeys = new Set<string>();

/** Pick a catalog template with openai-completions + Qwen thinking compat. */
export function qwenCatalogTemplateId(modelId: string): string {
  const id = modelId.trim().toLowerCase();
  if (id.includes('3.7')) {
    if (id.includes('max')) return 'qwen3.7-max';
    // qwen3.7-plus in catalog uses anthropic-messages; qwen3.6-plus has enable_thinking wiring.
    return 'qwen3.6-plus';
  }
  if (id.includes('3.6')) return 'qwen3.6-plus';
  return 'qwen3.6-plus';
}

/**
 * Register a MaaS deployment model id (e.g. qwen3.7-flash) in pi-ai's opencode-go catalog
 * by cloning metadata from a known template so enable_thinking / reasoning stream behave correctly.
 */
export function ensureQwenOpenCodeGoCatalogEntry(modelId: string, templateId: string): void {
  const normalizedModelId = modelId.trim();
  const overlayKey = `${normalizedModelId}::${templateId}`;
  if (overlayKeys.has(overlayKey) || OPENCODE_GO_MODELS[normalizedModelId]) {
    overlayKeys.add(overlayKey);
    return;
  }

  const template = OPENCODE_GO_MODELS[templateId];
  if (!template) return;

  (OPENCODE_GO_MODELS as Record<string, typeof template>)[normalizedModelId] = {
    ...template,
    id: normalizedModelId,
    name: normalizedModelId,
  };
  overlayKeys.add(overlayKey);
}

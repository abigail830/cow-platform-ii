import { parse as parseYaml } from 'yaml';

/** Whether job snapshot YAML enables LLM metadata extraction (matches openkms-cli metadata_extract_enabled). */
export function metadataExtractEnabledInJobSnapshot(configYaml: string | null | undefined): boolean {
  const raw = configYaml?.trim();
  if (!raw) return false;

  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch {
    return false;
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const meta = (doc as Record<string, unknown>).metadata_extract;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  const section = meta as Record<string, unknown>;
  if (section.enabled === false) return false;
  return Boolean(String(section.model_name ?? '').trim());
}

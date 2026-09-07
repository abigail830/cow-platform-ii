/**
 * Lightweight validation for pipeline worker config YAML stored in Admin.
 * Full schema is enforced by openkms-cli at runtime; here we reject secrets and ensure parseable YAML.
 */
import { parse as parseYaml } from 'yaml';

const FORBIDDEN_KEYS = new Set([
  'api_key',
  'apikey',
  'base_url',
  'baseurl',
  'model_id',
  'model_config_id',
]);

function rejectForbiddenKeys(node: unknown, path: string): void {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const loc = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(
          `Forbidden key "${key}" at ${loc || '(root)'}. Use model_name (Models list bold name); credentials come from the platform.`,
        );
      }
      rejectForbiddenKeys(value, loc);
    }
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => rejectForbiddenKeys(item, `${path}[${i}]`));
  }
}

/** Normalize blank → null; validate non-empty YAML. */
export function normalizePipelineConfigYaml(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  if (!text) return null;
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    throw new Error(`Invalid config YAML: ${message}`);
  }
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Config YAML must be a mapping (object) at the root');
  }
  rejectForbiddenKeys(data, '');
  return text;
}

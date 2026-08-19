import { loadAssetManifest } from '../../agent-assets/manifest.ts';

let cached: Set<string> | null = null;

export function getReservedSkillNames(): Set<string> {
  if (cached) return cached;
  const manifest = loadAssetManifest();
  cached = new Set(manifest.skills.map((skill) => skill.id));
  return cached;
}

export function isUuidSkillId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim(),
  );
}

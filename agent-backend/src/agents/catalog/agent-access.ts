import type { LoadedAgentSpec } from './schema.ts';

/** Whether a user's RBAC role keys match an agent's catalog `access.defaultForRoles`. */
export function isAgentVisibleToRoles(spec: LoadedAgentSpec, roleKeys: readonly string[]): boolean {
  const allowed = spec.access.defaultForRoles;
  if (allowed.length === 0) return false;
  const roleSet = new Set(roleKeys);
  return allowed.some((role) => roleSet.has(role));
}
